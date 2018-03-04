window.onload = function () {

    let app = new Vue({

        el: '#app',

        data: {

            ws: null,
            asks: [],
            bids: [],
            DISPLAY: 30,
            INITIAL_MIN: null,
            sequence: null,

        },

        created: function () {

            this.ws = this.connect("wss://ws.luno.com/XBTZAR");

        },

        computed: {
            asksToRender: function () {

                if (this.asks.length == 0) {
                    return [];
                }

                let m = new Map();
                let minIndex = parseInt(this.asks[0].price);
                let that = this;
                let temp = [];

                this.asks.forEach(function (a) {
                    let p = parseInt(a.price);
                    if (p == that.INITIAL_MIN) {
                        temp.push(JSON.stringify(a));
                    }
                    let v = parseFloat(a.volume);
                    minIndex = (p < minIndex ? p : minIndex);
                    if (m.get(p) === undefined) {
                        m.set(p, v);
                    } else {
                        m.set(p, m.get(p) + v);
                    }
                });

                console.log("LIST " + temp.length);

                if (this.INITIAL_MIN == null) {
                    this.INITIAL_MIN = minIndex;
                }

                let r = [{"price": minIndex, "volume": m.get(minIndex)}];
                let i = minIndex + 1;
                let safety = 0; //to prevent infinite loop
                let n = (m.size < this.DISPLAY ? m.size : this.DISPLAY);

                while ((r.length < n ) && (safety < 10000)) {
                    if (m.has(i)) {
                        r.push({"price": i, "volume": m.get(i)});
                    }
                    i = i + 1;
                    safety = safety + 1;
                }
                return r.reverse();

            },
            bidsToRender: function () {
                return this.sortOrders("DESC", this.bids).slice(0, 30);
            }
        },

        methods: {

            connect: function (uri) {
                this.ws = new WebSocket(uri);
                let that = this;
                let ws = this.ws;
                this.ws.addEventListener('message', function (e) {
                    if ((e.data) && (e.data.length > 2) && (that.sequence != null) && (parseInt(JSON.parse(e.data).sequence) != (that.sequence + 1))) {
                        console.log("RED ALERT: " + that.sequence + " " + JSON.parse(e.data).sequence);
                        that.sequence = null;
                        that.asks = [];
                        that.bids = [];
                        ws.close();
                    }
                    if ((e.data) && (e.data.length > 2)) {
                        that.sequence = parseInt(JSON.parse(e.data).sequence);
                        that.processSocketEvent(JSON.parse(e.data));
                    }
                });
                this.ws.addEventListener('error', function () {
                    alert("Failed to connect, please check your internet connection and refresh the page.");
                });
                this.ws.onclose = function (e) {
                    console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
                    setTimeout(function () {
                        that.ws = null;
                        that.connect("wss://ws.luno.com/XBTZAR");
                    }, 5000); //TODO: do gradual backoof
                };

            },

            processSocketEvent: function (event) {

                if ((event.asks) && (event.bids)) {
                    // This is the initial event
                    this.asks = event.asks;
                    this.bids = event.bids;
                } else {
                    // This is a subsequent update event

                    //TODO can take out
                    if ((event.trade_updates != null) && (event.create_update != null)) {
                        debugger;;
                    }

                    if (event.trade_updates != null) {
                        let that = this;
                        event.trade_updates.forEach(function (u) {
                            console.log("UPDATE: " + Math.ceil(Number(u.counter) / Number(u.base)));
                            if (Math.ceil(Number(u.counter) / Number(u.base)) == that.INITIAL_MIN) {
                                console.log(event.trade_updates);
                            }
                            that.deleteOrderIfExists(u);
                        });
                    }
                    if (event.create_update != null) {
                        this.processNewOrder(event.create_update);
                        console.log("NEW ");
                    }
                    if (event.delete_update != null) {
                        this.processDeletedOrder(event.delete_update);
                        console.log("DELETE");
                    }


                }

            },

            processNewOrder: function (update) {

                let order = {
                    id: update.order_id,
                    volume: update.volume,
                    price: update.price
                };

                if (parseInt(order.price) == this.INITIAL_MIN) {
                    console.log("NEW MIN: " + JSON.stringify(update));
                }

                if (update.type == "ASK") {
                    this.asks.push(order);
                } else if (update.type == "BID") {
                    this.bids.push(order);
                } else {
                    debugger;
                    ;
                }

            },

            processDeletedOrder: function (order) {
                if (parseInt(order.price) == this.INITIAL_MIN) {
                    console.log("DELETE MIN: " + JSON.stringify(order));
                }
                this.asks = this.asks.filter(function (a) {
                    return (a.id != order.order_id);
                });
                this.bids = this.bids.filter(function (b) {
                    return (b.id != order.order_id);
                });
            },

            deleteOrderIfExists: function (order) {

                //TODO: remove, this is a sanity check
                let ask = this.asks.filter(function (a) {
                    return (order.order_id == a.id);
                })[0];
                let bid = this.bids.filter(function (b) {
                    return (order.order_id == b.id);
                })[0];

                //Keep this part
                this.asks = this.asks.map(function (a) {
                    let ask = a;
                    if (order.order_id == a.id) {
                        ask.volume = parseFloat(ask.volume) - parseFloat(order.base);
                        console.log("current: " + ask.volume + ", base: " + order.base);
                    }
                    return ask;
                });
                this.bids = this.bids.filter(function (b) {
                    return (order.order_id != b.id);
                });

                //TODO: remove, this is a sanity check
                if (ask !== undefined) {
                    if (parseInt(ask.price) == this.INITIAL_MIN) {
                        console.log("REMOVE ASK ORDER_ID: " + ask.id + " volume: " + ask.volume + " price: " + ask.price);
                        console.log("TRADE UPDATE " + order.order_id);
                    }
                }
                if (bid !== undefined) {
                    if (parseInt(bid.price) == this.INITIAL_MIN) {
                        console.log("REMOVE BID" + bid.id + " volume: " + bid.volume);
                    }
                }

                if ((ask) && (parseInt(ask.price) != Math.ceil(Number(order.counter) / Number(order.base)))) {
                    debugger;
                    ;
                }

            },

            sortOrders: function (type, orders) {

                // TODO if number conversion fails, then what

                return orders.sort(function (a, b) {
                    if (parseInt(a.price) > parseInt(b.price)) {
                        return (type == "DESC" ? -1 : 1);
                    }
                    else if (parseInt(a.price) < parseInt(b.price)) {
                        return (type == "DESC" ? 1 : -1);
                    }
                    else {
                        return 0;
                    }
                });

            }

        }

    });

};