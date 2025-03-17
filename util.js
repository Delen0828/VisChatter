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
		if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
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
			if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
				if (newList.length >= 3) {
					let newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, newList[0], newList[1], taskList[2], csvData);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					let newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, value1 = -1, value2 = -1, taskList[2], 'symbol', csvData);
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
				let newVega = lineCompareTwo(vega, mainField, mainType, newList[0], newList[1], xList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'FILTER') {
				let newVega = lineThreshold(vega, mainType, subType, newList[0], xList, yList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
				if (newList.length >= 3) {
					let newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, newList[1], newList[2]);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					let newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList);
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
		if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
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
const TEMP = 0.2
const promptMsg = {
	model: "ft:gpt-4o-mini-2024-07-18:personal:vischatter-finetune-0225-final-mini:B4wfEQS4",  
	messages: [
		{"role": "system", "content": "You are a precise labeling assistant. Return only the label and key-values without explanation."},
		{"role": "user", "content": `Label the **CAPTION** based on the following **tasks** and extract key-values accordingly:

**Tasks:**
- **RETRIEVE**: Extract 1+ key-values (x-axis only).
- **COMPARE**: Compare 2+ key-values (x-axis only).
- **FILTER**: Extract 1 key-value (y-axis only).
- **TREND^**: Increasing trend, 2 key-values (x-axis only).
- **TREND-**: Stable trend, 2 key-values (x-axis only).
- **TRENDv**: Decreasing trend, 2 key-values (x-axis only).
- **RANGE**: Extract 2 key-values (y-axis only).

**Rules:**
0. **Determine Axes First**: Identify which column represents the x-axis and which represents the y-axis before extracting key-values. Do not explain this step.
1. **Axis Constraint**: RETRIEVE, COMPARE, and TREND use x-axis values; FILTER and RANGE use y-axis values.
2. **RETRIEVE vs. COMPARE**: RETRIEVE lists values; COMPARE highlights differences (e.g., 'A is highest, B is lowest' = COMPARE, 'A and B are the highest' = RETRIEVE).
3. **FILTER & RANGE Scaling**: Adjust values based on source units (e.g., '2 million' → '2' if unit is million, '2000' if thousand).
4. **Prioritize**: Identify the most important data fact.
5. **TREND Default Years**: If a TREND type fact does not specify certain years (e.g., 'overall increase'), use the first and last year from **DATA**.
6. **Strict Data Extraction**: Use key-values exactly as they appear in **DATA**. Do not expand abbreviations (if the extracted value is 'Jan', do not make it 'January'), correct misspellings, or modify extracted values (if the extracted value is 'US', do not make it 'USA').

` }, // Using the target message here
	],
	temperature: TEMP
}

function getPrompt(chartType, isMulti, target) {
	let newPromptMsg = JSON.parse(JSON.stringify(promptMsg));
	newPromptMsg['messages'][1]['content'] += target + '\n\n';
	return newPromptMsg;
}

function highLight(response, visID, spec) {
	const target = response;
	const speechResult = document.getElementById('right-panel');
	
	fetch(JSON.parse(spec)["data"]["url"])
		.then(response => response.text())
		.then(csvData => {
			let [xList, yList, legendList, isMulti] = getColumn(csvData);
			let chartType = JSON.parse(spec)["mark"]
			let prompt = getPrompt(chartType, isMulti, target);
			
			prompt.messages[1]['content'] += `**DATA**:\n${csvData}`;
			
			let payload = {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": decodeAsciiString(openai_yek),
				},
				body: JSON.stringify(prompt)
			}
			
			fetch("https://api.openai.com/v1/chat/completions", payload)
				.then(response => response.json())
				.then(data => {
					let taskList = data.choices[0].message.content
						.replace(/[\[\]']/g, '')
						.split(', ')
						.map(item => item.trim());
					let vega = JSON.parse(vlSpecDict[visID]);
					let fieldAndType = getMainSubFieldType(vega);
					let mainField = fieldAndType[0];
					let mainType = fieldAndType[1];
					let subField = fieldAndType[2];
					let subType = fieldAndType[3];
					let newList = taskList.slice(1);
					console.log('task: ', taskList[0])
					speechResult.textContent = `${response}`;
					
					highLightHelper(visID, taskList[0], vega, mainField, subField, mainType, subType, newList, xList, yList, taskList, legendList, isMulti, csvData)
				});
		});
}