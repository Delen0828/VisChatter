normalize = { 'date': '', 'Date': '', 'day': '', 'Day': '', 'month': 'month', 'Month': 'month', 'year': 'year', 'Year': 'year' }

function getMainSubFieldType(jsonObject) {
	// console.log('getMainSubFieldType', jsonObject)
	// console.log(jsonObject['config'])
	const encoding = jsonObject['encoding'];
	const markType = typeof jsonObject.mark === 'string' ? jsonObject.mark : jsonObject.mark?.type;
	if (markType === 'line' || markType === 'area') {
		return [encoding.x.field, encoding.x.type, encoding.y.field, encoding.y.type];
	}
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

function getLineSeriesField(spec) {
    const markType = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type;
    if (markType !== 'line' && markType !== 'area') return undefined;
    const detail = spec.encoding?.detail;
    return spec.encoding?.color?.field || (Array.isArray(detail) ? detail[0]?.field : detail?.field);
}

function getListSelected(csvData, legend, mainField, legendField, subField) {
    const [headers = [], ...rows] = d3.csvParseRows(csvData);
    const mainIndex = headers.indexOf(mainField);
    const seriesIndex = headers.indexOf(legendField);
    const subIndex = headers.indexOf(subField);
    const selected = rows.filter(row => row[seriesIndex] === legend);
    if (mainIndex < 0 || seriesIndex < 0 || !selected.length) {
        throw new Error('Comment saved. The selected series could not be found in the chart data.');
    }
    return [selected.map(row => row[mainIndex]), selected.map(row => row[subIndex])];
}

function lineComparable(value, type) {
    const result = type === 'quantitative' ? Number(value) : type === 'temporal' ? Date.parse(String(value)) : String(value);
    if (typeof result === 'number' && !Number.isFinite(result)) {
        throw new Error('Comment saved. The selected axis value could not be read.');
    }
    return result;
}

function orderedLineValues(values, type) {
    const unique = [...new Set(values.map(String))];
    return type === 'quantitative' || type === 'temporal'
        ? unique.sort((a, b) => lineComparable(a, type) - lineComparable(b, type))
        : unique;
}

function lineDatumExpression(field, type) {
    const datum = `datum[${JSON.stringify(field)}]`;
    if (type === 'quantitative') return `toNumber(${datum})`;
    if (type === 'temporal') return `time(toDate(${datum}))`;
    return `toString(${datum})`;
}

function lineSeriesFilter(legend, legendField) {
    return legend !== 'None' && legendField
        ? ` && toString(datum[${JSON.stringify(legendField)}]) === ${JSON.stringify(legend)}` : '';
}

function lineRangeFilter(field, type, value1, value2, values, legend, legendField) {
    const expression = lineDatumExpression(field, type);
    let filter;
    if (type === 'quantitative' || type === 'temporal') {
        const bounds = [lineComparable(value1, type), lineComparable(value2, type)].sort((a, b) => a - b);
        filter = `${expression} >= ${bounds[0]} && ${expression} <= ${bounds[1]}`;
    } else {
        const indices = [values.indexOf(String(value1)), values.indexOf(String(value2))].sort((a, b) => a - b);
        if (indices[0] < 0) throw new Error('Comment saved. The selected axis value could not be found in the chart data.');
        filter = `indexof(${JSON.stringify(values.slice(indices[0], indices[1] + 1))}, ${expression}) >= 0`;
    }
    return filter + lineSeriesFilter(legend, legendField);
}

function addLineHighlightLayers(vega, filters) {
    const base = { mark: vega.mark, encoding: JSON.parse(JSON.stringify(vega.encoding)) };
    vega.layer = [base, ...filters.map(filter => ({
        mark: JSON.parse(JSON.stringify(base.mark)),
        encoding: { ...JSON.parse(JSON.stringify(base.encoding)), opacity: { value: 1 } },
        transform: [{ filter }]
    }))];
    base.encoding.opacity = { value: 0.4 };
    delete vega.mark;
    delete vega.encoding;
    return vega;
}

function linePointFilter(mainField, mainType, value, valuelist, isMulti, legend, legendField, csvData) {
    const values = orderedLineValues(isMulti && legend !== 'None'
        ? getListSelected(csvData, legend, mainField, legendField)[0] : valuelist, mainType);
    const index = values.findIndex(candidate => lineComparable(candidate, mainType) === lineComparable(value, mainType));
    if (index < 0) throw new Error('Comment saved. The selected axis value could not be found in the chart data.');
    // Highlight the adjoining segment, including the actual last point at the end of a line.
    const start = Math.min(index, Math.max(0, values.length - 2));
    return lineRangeFilter(mainField, mainType, values[start], values[Math.min(start + 1, values.length - 1)], values, legend, legendField);
}

function lineHighlightOne(vega, mainField, mainType, value, valuelist, isMulti = false, legend = 'None', legendField, csvData) {
    return addLineHighlightLayers(vega, [linePointFilter(mainField, mainType, value, valuelist, isMulti, legend, legendField, csvData)]);
}

function lineCompareTwo(vega, mainField, mainType, value1, value2, valuelist, isMulti = false, legend1 = 'None', legend2 = 'None', legendField, csvData) {
    return addLineHighlightLayers(vega, [
        linePointFilter(mainField, mainType, value1, valuelist, isMulti, legend1, legendField, csvData),
        linePointFilter(mainField, mainType, value2, valuelist, isMulti, legend2, legendField, csvData)
    ]);
}

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
function lineTrend(vega, trend, mainField, subField, mainType, subType, xList = [], value1 = -1, value2 = -1, legend = 'None', legendField, csvData) {
    const values = orderedLineValues(legend !== 'None' && legendField
        ? getListSelected(csvData, legend, mainField, legendField, subField)[0] : xList, mainType);
    const start = value1 === -1 ? values[0] : value1;
    const end = value2 === -1 ? values[values.length - 1] : value2;
    const numericAxis = mainType === 'quantitative' || mainType === 'temporal';
    const bounds = (numericAxis
        ? [lineComparable(start, mainType), lineComparable(end, mainType)]
        : [values.indexOf(String(start)), values.indexOf(String(end))]).sort((a, b) => a - b);
    const selected = values.filter((value, index) => {
        const comparable = numericAxis ? lineComparable(value, mainType) : index;
        return comparable >= bounds[0] && comparable <= bounds[1];
    });
    if (!selected.length) throw new Error('Comment saved. No chart data matches the selected trend range.');
    const midPoint = selected[Math.floor((selected.length - 1) / 2)];
    const filter = lineRangeFilter(mainField, mainType, start, end, values, legend, legendField);
    addLineHighlightLayers(vega, [filter]);
    const label = { 'TREND^': 'Increase ↗', 'TREND-': 'Stable →', TRENDv: 'Decrease ↘' }[trend];
    // Keep the label and arrow together using the line's scales and series color.
    vega.layer.push({
        mark: { type: 'text', fontSize: 14, fontWeight: 600, baseline: 'bottom', dy: -10 },
        transform: [{ filter: `${lineDatumExpression(mainField, mainType)} === ${JSON.stringify(lineComparable(midPoint, mainType))}${lineSeriesFilter(legend, legendField)}` }],
        encoding: { ...JSON.parse(JSON.stringify(vega.layer[1].encoding)), text: { value: label } }
    });
    return vega;
}

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

function barCompareTwo(vega, mainField, value1, value2, csvData) {
	const [headers = [], ...rows] = d3.csvParseRows(csvData);
	const fieldIndex = headers.indexOf(mainField);
	const categories = [...new Set(rows.map(row => row[fieldIndex]).filter(value => typeof value === 'string'))];
	const selected = [value1, value2].map(value => {
		if (categories.includes(value)) return value;
		const matches = categories.filter(category => category.trim().toLowerCase() === value.trim().toLowerCase());
		if (matches.length !== 1) throw new Error(`Comment saved. The selected category ${JSON.stringify(value)} could not be found in the chart data.`);
		return matches[0];
	});
	vega["layer"] = [{ 'mark': vega['mark'], 'encoding': vega['encoding'] }]

	vega["layer"][0]["encoding"]["opacity"] = { "value": 0.4 }
	let new_layer = JSON.parse(JSON.stringify(vega["layer"][0]));
	new_layer["transform"] = [{ "filter": `indexof(${JSON.stringify(selected)}, toString(datum[${JSON.stringify(mainField)}])) >= 0` }]
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
