window.onload = function () {

    let app = new Vue({

        el: '#app',

        data: {

            asks: [],
            bids: [],
            DISPLAY_LIMIT: 250,
            last_sequence: null,
            retry_wait: 32,
            latest_updates: [],
            rolling_index: 0,
            latestClass: 'updated-order',
            error_message: null,
            scrolled_once: false

        },

        created: function () {

            this.connect("wss://ws.luno.com/XBTZAR");

        },


        updated: function () {
            if (!this.scrolled_once && (this.asks.length > 0)) {
                this.$refs.askstable.scrollTop = this.$refs.askstable.scrollHeight;
                this.scrolled_once = true;
            }
        },

        computed: {

            asksToRender: function () {
                if (this.asks.length == 0) {
                    return [];
                } else {
                    return this.prepareSquashedArray(this.asks, this.DISPLAY_LIMIT).reverse();
                }
            },

            bidsToRender: function () {
                if (this.bids.length == 0) {
                    return [];
                } else {
                    return this.prepareSquashedArray(this.bids, this.DISPLAY_LIMIT);
                }
            },

            spread: function () {
                if (this.asks[0] && this.bids[0]) {
                    return this.asks[0].price - this.bids[0].price;
                } else {
                    return "";
                }
            }

        },

        /* Any methods needed */
        methods: {

            connect: function (uri) {

                //TODO: think about how to detect a network failure - what happens if we have not had a socket event in a while?

                this.ws = new WebSocket(uri);
                this.error_message = "Connecting, please wait...";
                let that = this;

                this.ws.addEventListener('message', function (e) {
                    let data = JSON.parse(e.data);
                    let sequence = parseInt(data.sequence); // make sure we have converted it to integer
                    if (sequence && (that.last_sequence != null) && (sequence != (that.last_sequence + 1))) {
                        console.log("ERROR! Sequence error, closing socket.");
                        that.error_message = "Sequence error, wait for restart...";
                        that.asks = [];
                        that.bids = [];
                        that.last_sequence = null;
                        that.ws.close();
                    } else if (sequence) {
                        that.error_message = "";
                        that.last_sequence = sequence;
                        that.processSocketEvent(data);
                    }
                });

                this.ws.addEventListener('error', function () {
                    console.log("ERROR! Socket error, closing socket.");
                    that.error_message = "Socket error, wait for restart...";
                    that.last_sequence = null;
                    that.ws.close();
                });

                this.ws.onclose = function () {
                    that.retry_wait = that.retry_wait * 2;
                    that.error_message = "Socket closed, retrying in " + that.retry_wait + " milliseconds";
                    console.log("SOCKET CLOSED. Milliseconds to retry: " + that.retry_wait);
                    setTimeout(function () {
                        that.ws = null;
                        that.connect("wss://ws.luno.com/XBTZAR");
                    }, that.retry_wait);
                };

            },

            processSocketEvent: function (event) {

                if ((event.asks) && (event.bids)) {

                    // This is the initial event
                    this.asks = event.asks;
                    this.bids = event.bids;

                } else {

                    // This is a subsequent update event
                    if (event.trade_updates != null) {
                        let that = this;
                        event.trade_updates.forEach(function (u) {
                            that.updateExistingOrder(u);
                        });
                    }
                    if (event.create_update != null) {
                        this.processNewOrder(event.create_update);
                    }
                    if (event.delete_update != null) {
                        this.processDeletedOrder(event.delete_update);
                    }

                }

            },

            processNewOrder: function (update) {

                let order = {
                    id: update.order_id,
                    volume: parseFloat(update.volume),
                    price: parseInt(update.price)
                };

                this.updateLatest(order.price);

                // insert the update into *ORDERED* array
                if (update.type == "ASK") {
                    for (let i = 0; i < this.asks.length; i++) {
                        if (this.asks[i].price >= order.price) {
                            this.asks.splice(i, 0, order);
                            break;
                        }
                    }
                } else if (update.type == "BID") {
                    for (let i = 0; i < this.bids.length; i++) {
                        if (this.bids[i].price <= order.price) {
                            this.bids.splice(i, 0, order);
                            break;
                        }
                    }
                }

            },

            processDeletedOrder: function (order) {

                let that = this;
                this.asks = this.asks.filter(function (a) {
                    if ((a.id === order.order_id)) {
                        that.updateLatest(a.price); // TODO: side effect, review later
                    }
                    return (a.id !== order.order_id);
                });
                this.bids = this.bids.filter(function (b) {
                    if ((b.id === order.order_id)) {
                        that.updateLatest(b.price); // TODO: side effect, review later
                    }
                    return (b.id !== order.order_id);
                });

            },

            /*
             This is time complexity O(2n) for both asks AND bids. We could do a for loop and splice the array instead of filtering, but
             since updates don't happen too frequently it is cleaner to use a map and a filter.
             */
            updateExistingOrder: function (order) {

                let that = this;
                this.asks = this.asks.map(function (a) {
                    let ask = a;
                    if (order.order_id === a.id) {
                        ask.volume = that.roundAfterSubtract((parseFloat(ask.volume) - parseFloat(order.base)));
                        that.updateLatest(a.price); // TODO: side effect, review later
                    }
                    return ask;
                }).filter(function (a) {
                    return (a.volume > 0);
                });

                this.bids = this.bids.map(function (b) {
                    let bid = b;
                    if (order.order_id === b.id) {
                        bid.volume = that.roundAfterSubtract((parseFloat(bid.volume) - parseFloat(order.base)));
                        that.updateLatest(b.price); // TODO: side effect, review later
                    }
                    return bid;
                }).filter(function (b) {
                    return (b.volume > 0);
                });

            },

            /* Squashes the array by adding up volumes of the same price, and returns first n items in squashed array. */
            prepareSquashedArray(a, n) {

                let priceToCount = parseInt(a[0].price);
                let runningTotal = 0.0;
                let r = [];

                for (let i = 0; i < a.length; i++) {
                    if (priceToCount === parseInt(a[i].price)) {
                        runningTotal = runningTotal + parseFloat(a[i].volume);
                    } else {
                        r.push({
                            "volume": runningTotal,
                            "price": priceToCount,
                            "isLatest": this.isLatest(priceToCount)
                        });
                        priceToCount = parseInt(a[i].price);
                        runningTotal = parseFloat(a[i].volume);
                    }
                    if (r.length === n) {
                        return r;
                    }
                }

                return r;

            },

            /* round to 9 decimal places */
            roundAfterSubtract(value)
            {
                return (Math.floor(value * 1000000000)) / 1000000000;
            },

            /* check whether the prices is amongst the latest updated (for styling) */
            isLatest(price)
            {
                return (this.latest_updates.indexOf(parseInt(price)) > -1);
            },

            /* update the list of prices that have most recently changed */
            updateLatest(price)
            {
                if (this.latest_updates.length < 10) {
                    this.latest_updates.push(parseInt(price));
                } else {
                    this.rolling_index = (this.rolling_index + 1) % 10;
                    this.latest_updates[this.rolling_index] = parseInt(price);
                }
            }

        }

    });

};