# Luno Order Book

This is my order book programming test. Welcome!

## How to run

To run, simply check out the repository and open index.html in your browser.

**NOTE:** I have tested the markup only in the latest version of Chrome, so for optimal user experience, please use that.

## Code and Architecture

I have attempted to keep a very basic architecture and focus on the code.

The javascript can be found in scripts/script.js. 

I have used Vue.js as the framework. Things to note about Vue:

* I have used the 'created' and 'updated' lifecyle hooks
* 'created' runs as soon as Vue instance has been created
* 'updated' runs after a data change causes the virtual DOM to be re-rendered and patched
* 'computed' is the section that handles computed properties that need to be rendered
* 'methods' is a section where any functions can be stored - most of my code is here

## View on Github Pages

Now available here: https://dinebennett.github.io/luno-order-book/
