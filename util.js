async function checkUrl(url, timeout = 1000) {
	const controller = new AbortController();
	const signal = controller.signal;

	const fetchPromise = fetch(url, { signal });

	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetchPromise;
		clearTimeout(timeoutId);
		if (response.ok) {
			return url;
		} else {
			throw new Error('Response not OK');
		}
	} catch (error) {
		return null;
	}
}

async function setUrl(number) {
	let newUrl = `https://raw.githubusercontent.com/vis-nlp/Chart-to-text/main/statista_dataset/dataset/data/${number}.csv`;
	let fallbackUrl = `https://raw.githubusercontent.com/vis-nlp/Chart-to-text/main/statista_dataset/dataset/multicolumn/data/${number}.csv`;

	let validUrl = await checkUrl(newUrl);
	if (!validUrl) {
		validUrl = await checkUrl(fallbackUrl);
	}

	if (validUrl) {
		return validUrl;
	} else {
		console.error('Both URLs are inaccessible');
		return null;
	}
}

function clearInput() {
	document.getElementById('input').value = '';
}

const textInput = document.getElementById('input');
const renderButton = document.getElementById('renderButton')
// const textArea = document.getElementById('vega-lite-code');

// Handle file selection
const msgPool = {}
// document.addEventListener('DOMContentLoaded', () => {
renderButton.addEventListener('mouseup', async function (e) {
	e.stopPropagation();
	const input = textInput.value;
	try {
		let vega = JSON.parse(input);
		let currentUrl = vega["data"]["url"];
		let match = currentUrl.match(/\/(\d+)\.tsv$/);
		if (match) {
			let number = match[1];
			let newUrl = await setUrl(number);
			if (newUrl) {
				vega["data"]["url"] = newUrl;
			}
		}
		let vl_spec = JSON.stringify(vega, null, 2);
		const uniqueId = `vis-${Math.floor(Date.now() / 1000)}`;
		const msgData = {
			id: uniqueId,
			text: vl_spec,
			time: Date.now()
		};
		// Store the message data in the dictionary
		if (!msgPool[uniqueId]) {
			msgPool[uniqueId] = msgData;
			const vegaEvent = new CustomEvent('vl-spec', { detail: msgData, id: uniqueId });
			document.body.dispatchEvent(vegaEvent);
		}
		else {
			console.log(msgPool)
			console.error('Existing chart:', uniqueId)
		}
	} catch (error) {
		console.error('Error input:', error);
	}
});
// });
const specPool = {}
document.body.addEventListener('vl-spec', (e) => {
	if (!specPool[e.detail.id]) {
		renderVegaLite(e.detail.text);
		specPool[e.detail.id] = e.detail;
	}
	else {
		console.log('Existing chart:', e.detial.id);
	}
});



function highLightHelper(visID, task, vega, mainField, subField, mainType, subType, newList, xList, yList, taskList, legendList, isMulti, csvData) {
	console.log('newList',newList)
	if (vega["mark"] == 'bar') {
		if (task == 'RETRIEVE') {
			let newVega = barHighlightOne(vega, mainField, newList[0]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'COMPARE') {
			let newVega = barCompareTwo(vega, mainField, newList[0], newList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'FILTER') {
			let newVega = barThreshold(vega, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'TREND') {
			let newVega = barTrend(vega, mainType, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'RANGE') {
			let newVega = barRange(vega, subField, taskList[1], newList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
	}
	if (vega["mark"] == 'line' || vega["mark"] == 'area') {
		if (isMulti) {
			if (task == 'RETRIEVE') {
				let newVega = lineHighlightOne(vega, mainField, mainType, newList[0], xList, isMulti, taskList[2], 'symbol', csvData); //TODO:change this to retrieval
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'COMPARE') {
				let newVega = lineCompareTwo(vega, mainField, mainType, newList[0], newList[1], xList, isMulti, taskList[3], taskList[4], 'symbol', csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'FILTER') {
				let newVega = lineThreshold(vega, mainType, subType, newList[0], xList, yList, csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'TREND') {
				if (newList.length >= 3) {
					let newVega = lineTrend(vega, taskList[1], mainField, subField, mainType, subType, xList, newList[0], newList[1], taskList[2], csvData);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					let newVega = lineTrend(vega, taskList[1], mainField, subField, mainType, subType, xList, value1 = -1, value2 = -1, taskList[2], 'symbol', csvData);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
			}
			if (task == 'RANGE') {
				let newVega = lineRange(vega, mainField,mainType, subType, taskList[1], taskList[2], xList, yList, isMulti, csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
		}
		else {
			if (task == 'RETRIEVE') {
				let newVega = lineHighlightOne(vega, mainField, mainType, newList[0], xList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'COMPARE') {
				let newVega = lineCompareTwo(vega, mainField, subField, mainType, subType, newList[0], newList[1], xList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'FILTER') {
				let newVega = lineThreshold(vega, mainType, subType, newList[0], xList, yList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'TREND') {
				if (newList.length >= 3) {
					let newVega = lineTrend(vega, taskList[1], mainField, subField, mainType, subType, xList, newList[1], newList[2]);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					let newVega = lineTrend(vega, taskList[1], mainField, subField, mainType, subType, xList);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
			}
			if (task == 'RANGE') {
				let newVega = lineRange(vega, mainField,mainType,subType, taskList[1], taskList[2], xList, yList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
		}
	}
	if (vega["mark"] == "circle") {
		if (task == 'RETRIEVE') {
			let newVega = scatterHighlightOne(vega, mainField, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'COMPARE') {
			let newVega = scatterCompareTwo(vega, mainField, subField, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'FILTER') {
			let newVega = scatterThreshold(vega, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'TREND') { //TODO:check whether need to be taken out of the bracket
			let newVega = scatterTrend(vega, mainField, subField);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'RANGE') {
			let newVega = scatterRange(vega, subField, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
	}
}
const TEMP = 0.5
const barMsg = {
	model: "gpt-4-turbo",
	messages: [
		{ role: "system", content: "You are a helpful assistant for labeling datasets.  Return only the label without explanation." },
		{ role: "user", content: "You need to label FACT with different tasks and retrieve key words or values. The tasks include: RETRIEVE (word), COMPARE (word1, word2), FILTER (value), TREND (INCREASE or DECREASE or STABLE, value1(optional), value2(optional)), RANGE (value1, value2)." },
		{ role: "assistant", content: "I understand. I will just classify." },
		{ role: "user", content: "FACT: The ticket price of NFL is just over 60 dollars, and the Olympic price is 100 dollars." },
		{ role: "assistant", content: "COMPARE, NFL, Olympic" },
		{ role: "user", content: "FACT: Viewers of Minecraft on twitch has gradually increased between 2018 and 2020." },
		{ role: "assistant", content: "TREND, INCREASE, 2018, 2020" },
		{ role: "user", content: "FACT: There are thousands of Bayern Munich fans and this number has seen a steady growth over the last twelve years." },
		{ role: "assistant", content: "TREND, INCREASE" },
		{ role: "user", content: "FACT: Energy consumption in USA was fairly stable between 200 and 240." },
		{ role: "assistant", content: "RANGE, 200, 240" },
		{ role: "user", content: "FACT: The majorly of the big cities are higher than 3 index points." },
		{ role: "assistant", content: "FILTER, 3" },
		{ role: "user", content: "FACT: Omsk has the largest value of 3.5 index points in 2008." },
		{ role: "assistant", content: "RETRIEVE, Omsk" },
		{ role: "user", content: "FACT: Compact cars has the highest sales." },
		{ role: "assistant", content: "RETRIEVE, Compact" },
		{ role: "user", content: `FACT: ` }, // Using the target message here
	],
	temperature: TEMP
}
const lineMsg = {
	model: "gpt-4-turbo",
	messages: [
		{ role: "system", content: "You are a helpful assistant for labeling datasets.  Return only the label without explanation." },
		{ role: "user", content: "You need to label FACT with different tasks and retrieve key (temporal) values. The tasks include: RETRIEVE (value), COMPARE (value1, value2), FILTER (value(non-temporal)), TREND (INCREASE or DECREASE or STABLE, value1(optional), value2(optional)), RANGE (value1(non-temporal), value2(non-temporal))." },
		{ role: "assistant", content: "I understand. I will just classify." },
		{ role: "user", content: "FACT: The ticket price of NFL shown for 2006 is just over 60 dollars, and it rises from that point to just over 100 dollars in 2018." },
		{ role: "assistant", content: "COMPARE, 2006, 2018" },
		{ role: "user", content: "FACT: Viewers of Minecraft on twitch has gradually increased between 2018 and 2020." },
		{ role: "assistant", content: "TREND, INCREASE, 2018, 2020" },
		{ role: "user", content: "FACT: There are thousands of Bayern Munich fans and this number has seen a steady growth over the last twelve years." },
		{ role: "assistant", content: "TREND, INCREASE" },
		{ role: "user", content: "FACT: Energy consumption in USA was fairly stable between 200 and 240." },
		{ role: "assistant", content: "RANGE, 200, 240" },
		{ role: "user", content: "FACT: The majorly of the big cities are higer than 3 index points." },
		{ role: "assistant", content: "FILTER, 3" },
		{ role: "user", content: "FACT: Omsk has the largest value of 3.5 index points in 2008." },
		{ role: "assistant", content: "RETRIEVE, 2008" },
		{ role: "user", content: `FACT: ` }, // Using the target message here
	],
	temperature: TEMP
}
const multiLineMsg = {
	model: "gpt-4-turbo",
	messages: [
		{ role: "system", content: "You are a helpful assistant for labeling datasets.  Return only the label without explanation." },
		{ role: "user", content: "You need to label FACT with different tasks and retrieve key (temporal) values. The tasks include: RETRIEVE (value, legend), COMPARE (value1, value2, legend1, legend2), FILTER (value(non-temporal)), TREND (INCREASE or DECREASE or STABLE, legend, value1(optional), value2(optional)), RANGE (value1(non-temporal), value2(non-temporal))." },
		{ role: "assistant", content: "I understand. I will just classify." },
		{ role: "user", content: "FACT: The ticket price of NFL shown for 2006 is just over 60 dollars, and it rises from that point to just over 100 dollars in 2018." },
		{ role: "assistant", content: "COMPARE, 2006, 2018, NFL, NFL" },
		{ role: "user", content: "FACT: The ticket price of NFL shown for 2006 is 60 dollars, while the price of Olympics is 100 dollars." },
		{ role: "assistant", content: "COMPARE, 2006, 2006, NFL, Olympics" },
		{ role: "user", content: "FACT: Viewers of Minecraft on twitch has gradually increased between 2018 and 2020." },
		{ role: "assistant", content: "TREND, INCREASE, Minecraft, 2018, 2020" },
		{ role: "user", content: "FACT: There are thousands of Bayern Munich fans and this number has seen a steady growth over the last twelve years." },
		{ role: "assistant", content: "TREND, INCREASE, Bayern Munich" },
		{ role: "user", content: "FACT: Energy consumption in USA was fairly stable between 200 and 240." },
		{ role: "assistant", content: "RANGE, 200, 240" },
		{ role: "user", content: "FACT: The majorly of the big cities are higer than 3 index points." },
		{ role: "assistant", content: "FILTER, 3" },
		{ role: "user", content: "FACT: Omsk has the largest value of 3.5 index points in 2008." },
		{ role: "assistant", content: "RETRIEVE, 2008, Omsk" },
		{ role: "user", content: `FACT: ` }, // Using the target message here
	],
	temperature: TEMP
}
const scatterMsg = {
	model: "gpt-4-turbo",
	messages: [
		{ role: "system", content: "You are a helpful assistant for labeling datasets.  Return only the label without explanation." },
		{ role: "user", content: "You need to label FACT with different tasks and retrieve key (temporal) values. The tasks include: FILTER (value(non-temporal)), TREND (INCREASE or DECREASE), RANGE (value1(non-temporal), value2(non-temporal))." },
		{ role: "assistant", content: "I understand. I will just classify." },
		{ role: "user", content: "FACT: The health condition is proportional with the averaged income" },
		{ role: "assistant", content: "TREND, INCREASE" },
		{ role: "user", content: "FACT: The population falls with the averaged income increasing" },
		{ role: "assistant", content: "TREND, DECREASE" },
		{ role: "user", content: "FACT: Energy consumption in USA was fairly stable between 200 and 240." },
		{ role: "assistant", content: "RANGE, 200, 240" },
		{ role: "user", content: "FACT: The majorly of the big cities are higer than 3 index points." },
		{ role: "assistant", content: "FILTER, 3" },
		{ role: "user", content: `FACT: ` }, // Using the target message here
	],
	temperature: TEMP
}

function getPrompt(chartType, isMulti, target) {
	// console.log(chartType,isMulti,target)
	if (chartType == 'line' || chartType == 'area') {
		if (isMulti) {
			let newMultiLineMsg = JSON.parse(JSON.stringify(multiLineMsg));
			newMultiLineMsg['messages'][newMultiLineMsg['messages'].length - 1]['content'] += target;
			return newMultiLineMsg
		}
		else {
			let newLineMsg = JSON.parse(JSON.stringify(lineMsg));
			newLineMsg['messages'][newLineMsg['messages'].length - 1]['content'] += target;
			return newLineMsg
		}
	} else {
		if (chartType == 'bar') {
			let newBarMsg = JSON.parse(JSON.stringify(barMsg));
			newBarMsg['messages'][newBarMsg['messages'].length - 1]['content'] += target;
			return newBarMsg
		}
		if (chartType == 'circle') {
			let newScatterMsg = JSON.parse(JSON.stringify(scatterMsg));
			newScatterMsg['messages'][newScatterMsg['messages'].length - 1]['content'] += target;
			return newScatterMsg
		}
	}
}
function highLight(response, visID, spec) {
	// console.log('Highlighting:',JSON.stringify(response));
	// const matchContainer = document.getElementById("match-sentence");
	// const speechContainer= document.getElementById("speech-container")
	// speechContainer.innerHTML=`<p><b>Highlight: </b>${response}</p>`
	const target = response;
	fetch(JSON.parse(spec)["data"]["url"])
		.then(response => response.text())
		.then(csvData => {
			// Remove all commas and newlines
			// const DataTable = csvData.replace(/[\n,]/g, ' ');
			let [xList, yList, legendList, isMulti] = getColumn(csvData);
			let chartType = JSON.parse(spec)["mark"]
			// console.log(chartType)
			let prompt = JSON.stringify(getPrompt(chartType, isMulti, target))
			let payload = {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": decodeAsciiString(openai_yek),
				},
				body: prompt
			}
			console.log(prompt, payload)
			fetch("https://api.openai.com/v1/chat/completions", payload)
				.then(response => response.json())
				.then(data => {
					let taskList = data.choices[0].message.content.split(", ");
					console.log(taskList)
					// const parsedData = d3.csvParse(csvData);
					// console.log(parsedData)
					let vega = JSON.parse(vlSpecDict[visID]);
					// console.log(vl_spec)
					let fieldAndType = getMainSubFieldType(vega);
					let mainField = fieldAndType[0];
					let mainType = fieldAndType[1];
					let subField = fieldAndType[2];
					let subType = fieldAndType[3];
					let newList = []
					fetch(vega["data"]["url"]).then(response => response.text())
						.then(csvData => {
							let [xList, ylist, legendList, isMulti] = getColumn(csvData).filter(item => item !== '');
							// console.log(xList);
							let queryPromises = [];
							for (let i = 1; i < taskList.length; i++) {
								queryPromises.push(
									query({
										"inputs": {
											"source_sentence": taskList[i],
											"sentences": xList
										}
									}).then((response) => {
										// console.log(JSON.stringify(response));
										return xList[indexOfMax(response)];
									}));
							}
							return Promise.all(queryPromises)
								.then(results => {
									newList.push(...results);
									// console.log('vissss', visID);
									highLightHelper(visID, taskList[0], vega, mainField, subField, mainType, subType, newList, xList, yList, taskList, legendList, isMulti, csvData)
								});
						})
				});
		});
}