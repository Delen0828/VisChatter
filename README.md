# Introduction

This is a prototype called VisChatter for online collaboration on data visualization, available at (link). For simplicity, it only supports local network (two devices connected to the same network) right now. You can test it by open it in one browser tab, copy the sharing link, paste and open it in another browser tab.

# Directories

### VisChatter

`index.html` is the HTML page of VisChatter, using `style.css` for better format and calling other JS files for functionality.

`delete.js` contains functions used to delete visualizations from the dashboard.

`drag.js` contains functions used to drag visualizations on the dashboard.

`highlight.js` contains functions of Vega-lite code modification. Those functions takes keywords returned by GPT as input and output highlighted Vega-lite code.

`util.js` contains functions used to call GPT APIs and other helper functions.

`vega.js` contains functions used to render Vega-lite code.

`visconnect-bundle.js` is forked from [VisConnect](https://visconnect.us/). It is a peer-to-peer protocol for synchronizing event among browsers. 

### Analyze

`Analyze/Evaluation` contains all the code and raw data for user study evaluation.

`Analyze/Formative` contains all the code and raw data used for the second formative study.

`Analyze/Test` contains all the code used for comparing the performance between GPT-4-turbo and fine-tuned llama-3-8b.



