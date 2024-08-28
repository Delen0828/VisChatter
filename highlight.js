normalize = { 'date': '', 'Date': '', 'day': '', 'Day': '', 'month': 'month', 'Month': 'month', 'year': 'year', 'Year': 'year' }
// time_format = { 'date': 'D', 'Date': 'D', 'day': 'D', 'Day': 'D', 'month': 'M', 'Month': 'M', 'year': 'Y', 'Year': 'Y' }
// test_vega={
// 	"config": {
// 		"background": "#f9f9f9",
// 		"area": {
// 			"fill": "#ab5787"
// 		},
// 		"line": {
// 			"stroke": "#ab5787"
// 		},
// 		"rect": {
// 			"fill": "#ab5787"
// 		},
// 		"bar": {
// 			"fill": "#ab5787"
// 		},
// 		"point": {
// 			"fill": "#ab5787",
// 			"size": 30
// 		},
// 		"axis": {
// 			"domainColor": "#979797",
// 			"domainWidth": 0.5,
// 			"gridWidth": 0.2,
// 			"labelColor": "#979797",
// 			"tickColor": "#979797",
// 			"tickWidth": 0.2,
// 			"titleColor": "#979797"
// 		},
// 		"axisBand": {
// 			"grid": false
// 		},
// 		"axisX": {
// 			"grid": true,
// 			"tickSize": 10
// 		},
// 		"axisY": {
// 			"domain": false,
// 			"grid": true,
// 			"tickSize": 0
// 		},
// 		"legend": {
// 			"labelFontSize": 11,
// 			"padding": 1,
// 			"symbolSize": 30,
// 			"symbolType": "square"
// 		},
// 		"range": {
// 			"category": [
// 				"#ab5787",
// 				"#51b2e5",
// 				"#703c5c",
// 				"#168dd9",
// 				"#d190b6",
// 				"#00609f",
// 				"#d365ba",
// 				"#154866",
// 				"#666666",
// 				"#c4c4c4"
// 			]
// 		}
// 	},
// 	"data": {
// 		"url": "https://raw.githubusercontent.com/vis-nlp/Chart-to-text/main/statista_dataset/dataset/data/1000.csv"
// 	},
// 	"mark": "line",
// 	"encoding": {
// 		"color": {
// 			"value": "#c4c4c4"
// 		},
// 		"x": {
// 			"type": "temporal",
// 			"axis": {
// 				"labelAngle": -45
// 			},
// 			"bin": false,
// 			"field": "Year"
// 		},
// 		"y": {
// 			"type": "quantitative",
// 			"axis": {
// 				"title": "Ticket price in U.S. dollars"
// 			},
// 			"field": "Ticket price in U\\.S\\. dollars"
// 		}
// 	},
// 	"title": [
// 		"National Football League average ticket",
// 		"price from 2006 to 2019 (in U.S. dollars)"
// 	],
// 	"$schema": "https://vega.github.io/schema/vega-lite/v4.8.1.json"
// }
// testVega = {
// 	"$schema": "https://vega.github.io/schema/vega-lite/v5.json",
// 	"description": "Stock prices of 5 Tech Companies over Time.",
// 	"data": { "url": "https://raw.githubusercontent.com/vega/vega-datasets/main/data/stocks.csv" },
// 	"mark": "line",
// 	"encoding": {
// 		"x": { "field": "date", "type": "temporal" },
// 		"y": { "field": "price", "type": "quantitative" },
// 		"color": { "field": "symbol", "type": "nominal" }
// 	}
// }

// testVega = { "config": { "background": "#000", "title": { "color": "#fff", "subtitleColor": "#fff" }, "style": { "guide-label": { "fill": "#fff" }, "guide-title": { "fill": "#fff" } }, "axis": { "domainColor": "#fff", "gridColor": "#888", "tickColor": "#fff" }, "range": { "category": ["#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666"] } }, "data": { "url": "https://raw.githubusercontent.com/vis-nlp/Chart-to-text/main/statista_dataset/dataset/data/10030.csv" }, "mark": "bar", "encoding": { "color": { "value": "#386cb0" }, "x": { "type": "quantitative", "axis": { "labelAngle": -30, "title": "New registrations in thousands" }, "field": "New registrations in thousands" }, "y": { "type": "nominal", "axis": {}, "bin": false, "field": "programming language" } }, "title": ["Number of car registrations in Europe in", "2019 , by segment (in 1,000s)"], "$schema": "https://vega.github.io/schema/vega-lite/v4.8.1.json" }

// testVega = {
// 	"$schema": "https://vega.github.io/schema/vega-lite/v5.json",
// 	"data": { "url": "https://raw.githubusercontent.com/vega/vega-datasets/main/data/cars.json" },
// 	"mark": "circle",
// 	"encoding": {
// 		"x": { "field": "Horsepower", "type": "quantitative" },
// 		"y": { "field": "Miles_per_Gallon", "type": "quantitative" },
// 		"color": { "value": "#4c78a8" }
// 	},
// 	"title": "The horsepower and MPG of different cars"
// }

function getMainSubFieldType(jsonObject) {
	// console.log('getMainSubFieldType', jsonObject)
	// console.log(jsonObject['config'])
	const encoding = jsonObject['encoding'];
	console.log('encoding', encoding)
	if (encoding['x'].type === 'nominal' || encoding['x'].type === 'temporal') {
		return [encoding['x'].field, encoding['x'].type, encoding['y'].field, encoding['y'].type];
	}
	if (encoding['y'].type === 'nominal' || encoding['y'].type === 'temporal') {
		return [encoding['y'].field, encoding['y'].type, encoding['x'].field, encoding['x'].type];
	}
	return [encoding['x'].field, encoding['x'].type, encoding['y'].field, encoding['y'].type];
	// }
	// // You might want to handle the case where 'encoding' is not in jsonObject.
	// return [null, null, null, null];
}

function removeLonelyNumbers(lst) {
	let result = [];
	lst.sort((a, b) => a - b);
	for (let i = 0; i < lst.length; i++) {
		if (i === 0) {
			if (lst[i + 1] - lst[i] === 1) {
				result.push(lst[i]);
			}
		}
		if (i === lst.length - 1) {
			if (lst[i] - lst[i - 1] === 1) {
				result.push(lst[i]);
			}
		}
		if (i !== 0 && i !== lst.length - 1) {
			if (lst[i] - lst[i - 1] === 1 || lst[i + 1] - lst[i] === 1) {
				result.push(lst[i]);
			}
		}
	}
	return result;
}

function generateConditions(numlist, mainField) {
	let filteredYears = removeLonelyNumbers(numlist);
	console.log(filteredYears);
	let ranges = [];
	let start = null;
	for (let year of filteredYears) {
		if (start === null) { start = year; }
		else if (!filteredYears.includes(year + 1)) {
			let end = year;
			if (start !== end) { ranges.push([start, end]); }
			start = null;
		}
	}
	if (start !== null) {
		let end = filteredYears[filteredYears.length - 1];
		if (start !== end) { ranges.push([start, end]); }
	}
	let conditions = ranges.map(range => `(${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate(${range[0] - 1})) && ${normalize[mainField]}(datum['${mainField}']) <= ${normalize[mainField]}(toDate(${range[1] - 1})))`);
	return conditions;
}

function convertS2D(jsonData) {
	// Pattern to match outermost single quotes and inner single quotes not followed by a word character
	const pattern = /(?<!\w)'(.*?)(?<!\w)'/g;
	// Replace outermost single quotes with double quotes and escape inner single quotes
	return jsonData.replace(pattern, (match, group) => '"' + group.replace(/'/g, "\\'") + '"');
}

function getOppositeColor(hex) {
	// Remove the hash at the start if it's there
	hex = hex.replace(/^#/, '');
	// Parse the r, g, b values
	let r = parseInt(hex.substring(0, 2), 16);
	let g = parseInt(hex.substring(2, 4), 16);
	let b = parseInt(hex.substring(4, 6), 16);
	// Get the opposite color
	r = 255 - r;
	g = 255 - g;
	b = 255 - b;
	// Convert r, g, b back to hex
	let rHex = r.toString(16).padStart(2, '0');
	let gHex = g.toString(16).padStart(2, '0');
	let bHex = b.toString(16).padStart(2, '0');
	// Combine them to form the final hex color
	return `#${rHex}${gHex}${bHex}`;
}

function smallerOf(a, b) {
	// Check if inputs are date strings
	const dateA = new Date(a);
	const dateB = new Date(b);

	// If both are valid dates, compare them
	if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
		return dateA < dateB ? a : b;
	}

	// Otherwise, fall back to number comparison
	return a < b ? a : b;
}

function biggerOf(a, b) {
	// Check if inputs are date strings
	const dateA = new Date(a);
	const dateB = new Date(b);

	// If both are valid dates, compare them
	if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
		return dateA > dateB ? a : b;
	}

	// Otherwise, fall back to number comparison
	return a > b ? a : b;
}

function fixIndex(index, valuelist) {
	if (index >= valuelist.length - 2) { return valuelist.length - 4 }
	else { return index }
}

function getListSelected(csvData, legend) {
	console.log(csvData)
	let rows = csvData.split('\n');
	let xList = [];
	let yList = [];
	for (let i = 0; i < rows.length; i++) {
		let columns = rows[i].split(',');
		if (columns[0] == legend) {
			xList.push(columns[1]);
			yList.push(columns[2]);
		}
	}
	return [xList, yList]
}

function lineHighlightOne(vega, mainField, mainType, value, valuelist, isMulti = false, legend = 'None', legendField = 'None', csvData) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));

	// console.log(valuelist)
	// console.log(index, valuelist[index])
	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	if (isMulti == true) {
		let valuelist = getListSelected(csvData, legend)[0]
		let index = fixIndex(valuelist.indexOf(value), valuelist)
		if (mainType === 'temporal') {
			// vega["data"]["format"] = { "type": "csv", "parse": { [mainField]: `date:'%${time_format[mainField]}'` } };
			new_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[index + 1], valuelist[index])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[index], valuelist[index + 1])}')) && datum['${legendField}']=='${legend}'`
			}]
		} else {
			new_layer["transform"] = [{
				"filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[index + 1], valuelist[index])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[index], valuelist[index + 1])} && datum['${legendField}']=='${legend}'`
			}]
		}
	}
	else {
		let index = fixIndex(valuelist.indexOf(value), valuelist)
		if (mainType === 'temporal') {
			// vega["data"]["format"] = { "type": "csv", "parse": { [mainField]: `date:'%${time_format[mainField]}'` } };
			new_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[index + 1], valuelist[index])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[index], valuelist[index + 1])}'))`
			}]
		} else {
			new_layer["transform"] = [{ "filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[index + 1], valuelist[index])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[index], valuelist[index + 1])}` }]
		}
	}
	new_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// fetch('https://raw.githubusercontent.com/vega/vega-datasets/main/data/stocks.csv')
// 	.then(response => response.text())
// 	.then(csvText => {
// 		// Split the CSV into rows
// 		const rows = csvText.split('\n');

// 		// Extract the header (first row) and the rest of the rows
// 		const headers = rows[0].split(',');
// 		const dateIndex = headers.indexOf('date');

// 		// Extract the "date" column
// 		const dates = rows.slice(1) // Skip the header row
// 			.filter(row => row.trim() !== '') // Remove empty rows
// 			.map(row => row.split(',')[dateIndex]); // Get the date from each row
// 		outPut = JSON.stringify(lineHighlightOne(testVega, "date", "price", "temporal", "quantitative", 'Jan 1 2008', dates, isMulti = true, legend = 'GOOG', legendField = 'symbol'))
// 		console.log('done')
// 	})


function lineCompareTwo(vega, mainField, mainType, value1, value2, valuelist, isMulti = false, legend1 = 'None', legend2 = 'None', legendField = 'None', csvData) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	// var newcolor = getOppositeColor(vega["encoding"]["color"]["value"]);
	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	if (isMulti == true) {
		let valuelist = getListSelected(csvData, legend1)[0]
		let index = fixIndex(valuelist.indexOf(value1), valuelist)
		if (mainType === 'temporal') {
			new_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[index + 1], valuelist[index])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[index], valuelist[index + 1])}')) && datum['${legendField}']=='${legend1}'`
			}]
		} else {
			new_layer["transform"] = [{
				"filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[index + 1], valuelist[index])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[index], valuelist[index + 1])} && datum['${legendField}']=='${legend1}'`
			}]
		}
	}
	else {
		let index = fixIndex(valuelist.indexOf(value1), valuelist)
		if (mainType === 'temporal') {
			// vega["data"]["format"] = { "type": "csv", "parse": { [mainField]: `date:'%${time_format[mainField]}'` } };
			new_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[index + 1], valuelist[index])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[index], valuelist[index + 1])}'))`
			}]
		} else {
			new_layer["transform"] = [{ "filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[index + 1], valuelist[index])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[index], valuelist[index + 1])}` }]
		}
	}

	new_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(new_layer)

	let newnew_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	if (isMulti == true) {
		let valuelist = getListSelected(csvData, legend2)[0]
		let newindex = fixIndex(valuelist.indexOf(value2), valuelist)
		if (mainType === 'temporal') {
			// vega["data"]["format"] = { "type": "csv", "parse": { [mainField]: `date:'%${time_format[mainField]}'` } };
			newnew_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[newindex + 1], valuelist[newindex])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[newindex], valuelist[newindex + 1])}')) && datum['${legendField}']=='${legend2}'`
			}]
		} else {
			newnew_layer["transform"] = [{
				"filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[newindex + 1], valuelist[newindex])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[newindex], valuelist[newindex + 1])} && datum['${legendField}']=='${legend2}'`
			}]
		}
	}
	else {
		let newindex = fixIndex(valuelist.indexOf(value2), valuelist)		
		if (mainType === 'temporal') {
			// vega["data"]["format"] = { "type": "csv", "parse": { [mainField]: `date:'%${time_format[mainField]}'` } };
			newnew_layer["transform"] = [{
				"filter": `${normalize[mainField]}(toDate(datum['${mainField}'])) >= ${normalize[mainField]}(toDate('${smallerOf(valuelist[newindex + 1], valuelist[newindex])}')) && ${normalize[mainField]}(toDate(datum['${mainField}'])) <= ${normalize[mainField]}(toDate('${biggerOf(valuelist[newindex], valuelist[newindex + 1])}'))`
			}]
		} else {
			newnew_layer["transform"] = [{ "filter": `${mainField}(datum['${mainField}']) >= ${smallerOf(valuelist[newindex + 1], valuelist[newindex])} && ${mainField}(datum['${mainField}']) <= ${biggerOf(valuelist[newindex], valuelist[newindex + 1])}` }]
		}
	}
	newnew_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(newnew_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}

// fetch('https://raw.githubusercontent.com/vega/vega-datasets/main/data/stocks.csv')
// 	.then(response => response.text())
// 	.then(csvText => {
// 		// Split the CSV into rows
// 		const rows = csvText.split('\n');

// 		// Extract the header (first row) and the rest of the rows
// 		const headers = rows[0].split(',');
// 		const dateIndex = headers.indexOf('date');

// 		// Extract the "date" column
// 		const dates = rows.slice(1) // Skip the header row
// 			.filter(row => row.trim() !== '') // Remove empty rows
// 			.map(row => row.split(',')[dateIndex]); // Get the date from each row
// 		outPut = JSON.stringify(lineCompareTwo(testVega, "date", "price", "temporal", "quantitative", dates, isMulti = true, legend1 = 'GOOG', legend2 = 'AAPL', legendField = 'symbol'))
// 		console.log('done')
// 	})

function lineThreshold(vega, mainType, subType, value, xList, yList, csvData) {
	// let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])

	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }];
	let minY = Math.min(...yList);
	vega["layer"].push({
		"mark": { "type": "rect", "color": 'black', "stroke": 'black', "fillOpacity": 0, "strokeWidth": 2 },
		"data": { "values": [{ "PlotX1": `${xList[0]}`, "PlotX2": `${xList[xList.length - 1]}`, "PlotY1": `${minY}`, "PlotY2": `${value}` }] },
		"encoding": {
			"x": { "field": "PlotX1", "type": `${mainType}` },
			"x2": { "field": "PlotX2", "type": `${mainType}` },
			"y": { "field": "PlotY1", "type": `${subType}` },
			"y2": { "field": "PlotY2", "type": `${subType}` }
		}
	});
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut2 = JSON.stringify(lineThreshold(testVega, 'temporal', 'quantitative', 100, [2019, 2018, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008, 2007, 2006], [102.35, 100.26, 92.98, 85.83, 84.43, 81.54, 78.38, 77.34, 76.47, 74.99, 72.2, 67.11, 62.38]))
function getMidPoint(value1, value2, xList) {
	let filterXList = [value1, value2]
	let valuelist = xList
	let indexList = filterXList.map(element => valuelist.indexOf(element));
	if (value1 !== -1 && value2 === -1) { return valuelist[indexList[0]] }
	else {
		if (value1 === -1 && value2 !== -1) { return valuelist[indexList[1]] }
		else {
			if (value1 !== -1 && value2 !== -1) {
				let midPointIndex = Math.floor((indexList[0] + indexList[1]) / 2)
				return valuelist[midPointIndex]
			}
			else {
				let midPointIndex = Math.floor(valuelist.length / 2)
				return valuelist[midPointIndex]
			}
		}
	}
}

function getAngle(trend) {
	if (trend === "DECREASE") { return 45 }
	if (trend === "INCREASE") { return -45 }
	return 0

}
function lineTrend(vega, trend, mainField, subField, mainType, subType, xList = [], value1 = -1, value2 = -1, legend = 'None', legendField = 'None', csvData) {
	// console.log(trend)
	let angle = getAngle(trend)
	let midPoint = getMidPoint(value1, value2,xList)
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }];
	if (legend === 'None') {
		let newLayer = {
			"mark": { "type": "text", "filled": true, "angle": angle, "fontSize": 24, 'dy': -10 },
			"transform": [{ "filter": `${normalize[mainField]}(datum['${mainField}']) == ${normalize[mainField]}(toDate('${midPoint}'))` }],
			"encoding": {
				"text": { "value": "→" },
				// "color": { "value": 'black' },
				"x": { "type": mainType, "field": mainField },
				"y": { "type": subType, "field": subField }
			}
		}
		vega["layer"].push(newLayer);
	}
	else {
		let newLayer = {
			"mark": { "type": "text", "filled": true, "angle": angle, "fontSize": 24, 'dy': -10 },
			"transform": [{ "filter": `${normalize[mainField]}(datum['${mainField}']) == ${normalize[mainField]}(toDate('${midPoint}')) && datum['${legendField}']=='${legend}'` }],
			"encoding": {
				"text": { "value": "→" },
				// "color": { "value": 'black' },
				"x": { "type": mainType, "field": mainField },
				"y": { "type": subType, "field": subField }
			}
		}
		vega["layer"].push(newLayer);
	}
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut3 = JSON.stringify(lineTrend(testVega, "Year", "Ticket price in U\\.S\\. dollars", 'temporal', 'quantitative', 2006, 2008, [2019, 2018, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008, 2007, 2006], [102.35, 100.26, 92.98, 85.83, 84.43, 81.54, 78.38, 77.34, 76.47, 74.99, 72.2, 67.11, 62.38]))
// fetch('https://raw.githubusercontent.com/vega/vega-datasets/main/data/stocks.csv')
// 	.then(response => response.text())
// 	.then(csvText => {
// 		// Split the CSV into rows
// 		const rows = csvText.split('\n');
// 		// Extract the header (first row) and the rest of the rows
// 		const headers = rows[0].split(',');
// 		const dateIndex = headers.indexOf('date');
// 		// Extract the "date" column
// 		const dates = rows.slice(1) // Skip the header row
// 			.filter(row => row.trim() !== '') // Remove empty rows
// 			.map(row => row.split(',')[dateIndex]); // Get the date from each row
// 		outPut = JSON.stringify(lineTrend(testVega, "DECREASE", "date", "price", "temporal", "quantitative", xList = dates, value1 = 'Jan 1 2008', value2 = 'Jan 1 2009', 'GOOG', 'symbol'))
// 		// 'Jan 1 2008','Jan 1 2009',
// 		console.log('done')
// 	})

function lineRange(vega, mainField, mainType, subType, value1, value2, xList, yList, isMulti = false, csvData) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	if (isMulti) {
		// let minY = Math.min(...yList);
		vega["layer"].push({
			"mark": { "type": "rect", "color": 'black', "stroke": 'black', "fillOpacity": 0, "strokeWidth": 2 },
			"data": { "values": [{ "PlotX1": `${xList[1]}`, "PlotX2": `${xList[xList.length - 2]}`, "PlotY1": `${value1}`, "PlotY2": `${value2}` }] },
			"encoding": {
				"x": { "field": "PlotX1", "type": `${mainType}` },
				"x2": { "field": "PlotX2", "type": `${mainType}` },
				"y": { "field": "PlotY1", "type": `${subType}` },
				"y2": { "field": "PlotY2", "type": `${subType}` }
			}

		});
	}
	else {
		// let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])
		// let filterYList = yList.filter(number => number >= smallerOf(value1, value2) && number <= biggerOf(value1, value2))
		// let indexList = filterYList.map(element => yList.indexOf(element));
		// let filterXList = indexList.map(index => xList[index]);
		// conditions = generateConditions(filterXList, mainField)
		// conditions.forEach(condition => {
		// 	let newLayer = JSON.parse(JSON.stringify(vega["layer"][0])); // Deep copy
		// 	newLayer["transform"] = [{ "filter": condition }];
		// 	newLayer["encoding"]["color"]["value"] = newcolor
		// 	vega["layer"].push(newLayer);
		// });
		vega["layer"].push({
			"mark": { "type": "rect", "color": 'black', "stroke": 'black', "fillOpacity": 0, "strokeWidth": 2 },
			"data": { "values": [{ "PlotX1": `${xList[1]}`, "PlotX2": `${xList[xList.length - 2]}`, "PlotY1": `${value1}`, "PlotY2": `${value2}` }] },
			"encoding": {
				"x": { "field": "PlotX1", "type": `${mainType}` },
				"x2": { "field": "PlotX2", "type": `${mainType}` },
				"y": { "field": "PlotY1", "type": `${subType}` },
				"y2": { "field": "PlotY2", "type": `${subType}` }
			}

		});
	}
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut4 = JSON.stringify(lineRange(testVega, 'Year', 80, 100, [2019, 2018, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008, 2007, 2006], [102.35, 100.26, 92.98, 85.83, 84.43, 81.54, 78.38, 77.34, 76.47, 74.99, 72.2, 67.11, 62.38]))
// fetch('https://raw.githubusercontent.com/vega/vega-datasets/main/data/stocks.csv')
// 	.then(response => response.text())
// 	.then(csvText => {
// 		// Split the CSV into rows
// 		const rows = csvText.split('\n');
// 		// Extract the header (first row) and the rest of the rows
// 		const headers = rows[0].split(',');
// 		const dateIndex = headers.indexOf('date');
// 		const priceIndex = headers.indexOf('price')
// 		// Extract the "date" column
// 		const dates = rows.slice(1) // Skip the header row
// 			.filter(row => row.trim() !== '') // Remove empty rows
// 			.map(row => row.split(',')[dateIndex]); // Get the date from each row
// 		const price = rows.slice(1) // Skip the header row
// 			.filter(row => row.trim() !== '') // Remove empty rows
// 			.map(row => row.split(',')[priceIndex]); // Get the date from each row
// 		outPut = JSON.stringify(lineRange(testVega, "date", "temporal", "quantitative", 400, 600, dates, price, isMulti = true))
// 		console.log('done')
// 	})

function barHighlightOne(vega, mainField, value) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]

	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));

	let oldcolor = vega["encoding"]["color"]["value"]
	let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])

	new_layer["encoding"]["color"] = {
		"condition": { "test": `datum['${mainField}'] == '${value}'`, "value": newcolor },
		"value": oldcolor
	};
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut1 = JSON.stringify(barHighlightOne(testVega,'programming language','Small'))

function barCompareTwo(vega, mainField, value1, value2) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]

	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_layer["transform"] = [{ "filter": `datum['${mainField}'] == '${value1}' || datum['${mainField}'] == '${value2}'` }]
	new_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}

function barThreshold(vega, subField, value) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	console.log('Make this number', value)
	if (vega.encoding.x.field === subField) {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "x": { "datum": Number(value) } } });
	} else {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "y": { "datum": Number(value) } } });
	}
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut3 = JSON.stringify(barThreshold(testVega, 'New registrations in thousands', 1000))

function barTrend(vega, mainField, value1, value2) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]

	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	new_layer["transform"] = [{ "filter": `datum['${mainField}'] >= ${smallerOf(value1, value2)} && datum['${mainField}'] <=${biggerOf(value1, value2)}` }]
	new_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut4 = JSON.stringify(barTrend(testVega, 'Year', 2016,2018))

function barRange(vega, subField, value1, value2) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	new_layer["transform"] = [{ "filter": `datum['${subField}'] >= ${smallerOf(Number(value1), Number(value2))} && datum['${subField}'] <= ${biggerOf(Number(value1), Number(value2))}` }]
	new_layer["encoding"]["opacity"] = { "value": 1 }
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut5 = JSON.stringify(barRange(testVega, 'National debt in billion U\\.S\\. dollars', 220,300))
// outPut5=JSON.stringify(barRange(testVega, 'New registrations in thousands', 500, 1000))

function findClosestElement(list, x) {
	return list.reduce((closest, current) => {
		const currentDiff = Math.abs(current - x);
		const closestDiff = Math.abs(closest - x);
		return currentDiff < closestDiff ? current : closest;
	});
}

//TODO: fix mainField
function scatterHighlightOne(vega, mainField, subField, value) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_layer["transform"] = [{ "filter": `datum['${subField}']/${value}<1.05 && datum['${subField}']/${value}>0.95` }]
	new_layer["encoding"]["color"] = { "value": newcolor }
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut1 = JSON.stringify(scatterHighlightOne(testVega, "Horsepower", "Miles_per_Gallon", 45))

function scatterCompareTwo(vega, mainField, subField, value1, value2) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_layer["transform"] = [{ "filter": `datum['${subField}']/${value1}<1.05 && datum['${subField}']/${value1}>0.95` }]
	new_layer["encoding"]["color"] = { "value": newcolor }
	let new_new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_new_layer["transform"] = [{ "filter": `datum['${subField}']/${value2}<1.05 && datum['${subField}']/${value2}>0.95` }]
	new_new_layer["encoding"]["color"] = { "value": newcolor }
	vega["layer"].push(new_layer)
	vega["layer"].push(new_new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega;
}
// outPut1 = JSON.stringify(scatterCompareTwo(testVega, "Horsepower", "Miles_per_Gallon", 25,35))

function scatterThreshold(vega, subField, value) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	if (vega.encoding.x.field === subField) {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "x": { "datum": Number(value) } } });
	} else {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "y": { "datum": Number(value) } } });
	}
	delete vega['mark']
	delete vega['encoding']
	return vega;
}

function scatterRange(vega, subField, value1, value2) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	if (vega.encoding.x.field === subField) {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "x": { "datum": Number(value1) } } });
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "x": { "datum": Number(value2) } } });
	} else {
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "y": { "datum": Number(value1) } } });
		vega.layer.push({ "data": { "values": [{}] }, "mark": { "type": "rule", "color": "red" }, "encoding": { "y": { "datum": Number(value2) } } });
	}
	delete vega['mark']
	delete vega['encoding']
	return vega;
}

function scatterTrend(vega, mainField, subField) {
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]
	let newcolor = getOppositeColor(vega["encoding"]["color"]["value"])
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_layer['encoding']['color'] = { "value": 'red' }
	new_layer['transform'] = [{ "regression": subField, "on": mainField,"extent": [5000, 50000]}]
	new_layer['mark'] = 'line'
	new_layer['encoding']["strokeWidth"] = { "value": 2 }
	new_layer['encoding']["opacity"] = { "value": 1 }
	delete new_layer['encoding']['size']
	vega["layer"].push(new_layer)
	delete vega['mark']
	delete vega['encoding']
	return vega
}

// outPut1 = JSON.stringify(scatterTrend(testVega, "Horsepower", "Miles_per_Gallon"))