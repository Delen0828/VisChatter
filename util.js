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

// 添加全局字典用于存储消息与注释代码的映射关系
const messageAnnotationMap = {};
// 保存原始的可视化数据，用于重置
const originalVisualizations = {};

function highLightHelper(visID, task, vega, mainField, subField, mainType, subType, newList, xList, yList, taskList, legendList, isMulti, csvData) {
	console.log('newList',newList)
	let newVega;
	
	if (vega["mark"] == 'bar') {
		if (task == 'RETRIEVE') {
			newVega = barHighlightOne(vega, mainField, newList[0]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'COMPARE') {
			newVega = barCompareTwo(vega, mainField, newList[0], newList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'FILTER') {
			newVega = barThreshold(vega, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
			newVega = barTrend(vega, mainType, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'RANGE') {
			newVega = barRange(vega, subField, taskList[1], newList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
	}
	if (vega["mark"] == 'line' || vega["mark"] == 'area') {
		if (isMulti) {
			if (task == 'RETRIEVE') {
				newVega = lineHighlightOne(vega, mainField, mainType, newList[0], xList, isMulti, taskList[2], 'symbol', csvData); //TODO:change this to retrieval
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'COMPARE') {
				newVega = lineCompareTwo(vega, mainField, mainType, newList[0], newList[1], xList, isMulti, taskList[3], taskList[4], 'symbol', csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'FILTER') {
				newVega = lineThreshold(vega, mainType, subType, newList[0], xList, yList, csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
				if (newList.length >= 3) {
					newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, newList[0], newList[1], taskList[2], csvData);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, value1 = -1, value2 = -1, taskList[2], 'symbol', csvData);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
			}
			if (task == 'RANGE') {
				newVega = lineRange(vega, mainField,mainType, subType, taskList[1], taskList[2], xList, yList, isMulti, csvData);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
		}
		else {
			if (task == 'RETRIEVE') {
				newVega = lineHighlightOne(vega, mainField, mainType, newList[0], xList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'COMPARE') {
				newVega = lineCompareTwo(vega, mainField, mainType, newList[0], newList[1], xList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'FILTER') {
				newVega = lineThreshold(vega, mainType, subType, newList[0], xList, yList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
			if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
				if (newList.length >= 3) {
					newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList, newList[1], newList[2]);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
				else {
					newVega = lineTrend(vega, taskList[0], mainField, subField, mainType, subType, xList);
					const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
					document.body.dispatchEvent(event);
				}
			}
			if (task == 'RANGE') {
				newVega = lineRange(vega, mainField,mainType,subType, taskList[1], taskList[2], xList, yList);
				const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
				document.body.dispatchEvent(event);
			}
		}
	}
	if (vega["mark"] == "circle") {
		if (task == 'RETRIEVE') {
			newVega = scatterHighlightOne(vega, mainField, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'COMPARE') {
			newVega = scatterCompareTwo(vega, mainField, subField, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'FILTER') {
			newVega = scatterThreshold(vega, subField, taskList[1]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'TREND-' || task == 'TRENDv' || task == 'TREND^') {
			newVega = scatterTrend(vega, mainField, subField);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
		if (task == 'RANGE') {
			newVega = scatterRange(vega, subField, taskList[1], taskList[2]);
			const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
			document.body.dispatchEvent(event);
		}
	}

	// 返回生成的新图表数据，以便存储
	return newVega;
}
const TEMP = 0.2
const promptMsg = {
	model: "ft:gpt-4o-mini-2024-07-18:personal:vischatter-finetune-0319:BCsQ8ZTt",  
	messages: [
		{"role": "system", "content": "You are a precise labeling assistant. Return only the label and key-values without explanation."},
		{"role": "user", "content": `
		
		Your duty is to label the <caption> based on the following <task> and extract key-values accordingly from <data>.

		The <caption> can be classified as the following 7 <task>
		<task> RETRIEVE </task>: Extract 1+ key-values (x-axis only). e.g. 'The highest value is 100' = RETRIEVE
		<task> COMPARE </task>: Compare 2+ key-values (x-axis only). e.g. 'A is highest, B is lowest' = COMPARE
		<task> FILTER </task>: Extract 1 key-value (y-axis only). e.g. 'The values are higher than 100' = FILTER
		<task> TREND^ </task>: Increasing trend, 2 key-values (x-axis only). e.g. 'The values are increasing from 2010 to 2020' = TREND^
		<task> TREND- </task>: Stable trend, 2 key-values (x-axis only). e.g. 'The values are stable from 2010 to 2020' = TREND-
		<task> TRENDv </task>: Decreasing trend, 2 key-values (x-axis only). e.g. 'The values are decreasing from 2010 to 2020' = TRENDv
		<task> RANGE </task>: Extract 2 key-values (y-axis only). e.g. 'The values are between 100 and 200' = RANGE

		Follow the following 4 steps when you label and extract:
		Step 1: Identify the most important data fact from the <caption> 
		Step 2: Label the data fact with one <task> based on what analytic task it
		Step 3: Identify which column represents the x-axis and  y-axis from <data> 
		Step 4: Retrieve key values from <data> mentioned in <caption> based on the following 3 rules

		Follow the 3 rules in Step 4:
		Rule 1: Key values of <task> RETRIEVE </task>, <task>COMPARE</task>, <task>TREND-</task>,<task>TREND^</task>,<task>TRENDv</task> are x-axis values; Key values of <task> FILTER </task> and <task> RANGE </task> use y-axis values.
		Rule 2: <task>RETRIEVE</task> lists values; <task>COMPARE</task> highlights differences (e.g., 'A is highest, B is lowest' = COMPARE, 'A and B are the highest' = RETRIEVE)
		Rule 3: Extract the first and last year from the x-axis column of <data> if there is no certain years specified in <task> Trend- </task>, <task> Trend^ <task>, <task> Trendv <task> (e.g., 'overall increase')
		Rule 4: Do not change the value extracted from <data> (e.g. <caption> says 'The highest value is 100' but <data> says '100*, 99* ...', you should extract 100* as the key value)
		Rule 5: If "correlation" is mentioned, <task> will always be <task> TREND^ </task>.
		Rule 6: <task> RETRIEVE </task> is never used if <data> has more than 2 columns.
		
		` }, // Using the target message here
	],
	temperature: TEMP
}
function getPrompt(chartType, isMulti, target) {
	let newPromptMsg = JSON.parse(JSON.stringify(promptMsg));
	newPromptMsg['messages'][1]['content'] +=  `The actual <caption> and <data> are given below.
	<caption>`+target +'</caption>';
	return newPromptMsg;
}

function highLight(response, visID, spec) {
    const target = response;
    const speechResult = document.getElementById('right-panel');
    
    // 确保使用vlSpecDict中存储的原始规范
    let specObj;
    try {
        specObj = typeof spec === 'string' ? JSON.parse(spec) : spec;
    } catch (e) {
        console.error('解析规范出错:', e);
        return;
    }
    
    // 存储原始可视化数据（如果尚未存储）
    if (!originalVisualizations[visID]) {
        originalVisualizations[visID] = specObj;
        console.log('已存储原始可视化数据:', visID);
    }
    
    fetch(specObj["data"]["url"])
        .then(response => response.text())
        .then(csvData => {
            let [xList, yList, legendList, isMulti] = getColumn(csvData);
            let chartType = specObj["mark"];
            let prompt = getPrompt(chartType, isMulti, target);
            
            prompt.messages[1]['content'] += `<data> ${csvData} </data>
            Please label <caption> and extract from <data>. The response should be given as a python list:`;
            
            let payload = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": decodeAsciiString(openai_yek),
                },
                body: JSON.stringify(prompt)
            };
            
            fetch("https://api.openai.com/v1/chat/completions", payload)
                .then(response => response.json())
                .then(data => {
                    let taskList = data.choices[0].message.content
                        .replace(/[\[\]']/g, '')
                        .split(', ')
                        .map(item => item.trim());
                    
                    // 使用深度复制的原始规范作为基础，进行注释修改
                    let vega = JSON.parse(JSON.stringify(specObj));
                    let fieldAndType = getMainSubFieldType(vega);
                    let mainField = fieldAndType[0];
                    let mainType = fieldAndType[1];
                    let subField = fieldAndType[2];
                    let subType = fieldAndType[3];
                    let newList = taskList.slice(1);
                    console.log('task: ', taskList[0]);

                    // 生成注释后的可视化，并存储结果
                    const annotatedVega = highLightHelper(visID, taskList[0], vega, mainField, subField, mainType, subType, newList, xList, yList, taskList, legendList, isMulti, csvData);
                    
                    // 创建唯一ID用于关联消息和图表
                    const messageId = `message-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    
                    // 创建新消息元素
                    const newMessage = document.createElement('div');
                    newMessage.id = messageId;
                    newMessage.style.position = 'relative';
                    newMessage.style.paddingRight = '25px';
                    newMessage.textContent = `${response}`;
                    
                    // 添加hover效果，使消息在悬停时高亮显示
                    newMessage.style.transition = 'background-color 0.3s ease';
                    newMessage.addEventListener('mouseenter', () => {
                        newMessage.style.backgroundColor = '#f0f8ff'; // 淡蓝色背景表示活动状态
                    });
                    newMessage.addEventListener('mouseleave', () => {
                        newMessage.style.backgroundColor = '';
                    });
                    
                    // 保存消息与注释图表的关联
                    messageAnnotationMap[messageId] = {
                        visId: visID,
                        annotatedSpec: annotatedVega
                    };
                    
                    // 添加鼠标悬停事件
                    newMessage.addEventListener('mouseenter', () => {
                        // 当鼠标悬停在消息上时，显示注释后的图表
                        const eventData = messageAnnotationMap[messageId];
                        if (eventData && eventData.annotatedSpec) {
                            console.log('显示注释图表:', eventData.visId);
                            const event = new CustomEvent('newVega-message', { 
                                detail: [eventData.annotatedSpec, eventData.visId] 
                            });
                            document.body.dispatchEvent(event);
                        }
                    });
                    
                    // 添加鼠标离开事件
                    newMessage.addEventListener('mouseleave', () => {
                        // 当鼠标离开消息时，恢复原始图表
                        const originalSpec = originalVisualizations[visID];
                        if (originalSpec) {
                            console.log('恢复原始图表:', visID);
                            const event = new CustomEvent('newVega-message', { 
                                detail: [originalSpec, visID] 
                            });
                            document.body.dispatchEvent(event);
                        }
                    });
					
					// 创建删除按钮
					const removeButton = document.createElement('button');
					removeButton.innerHTML = '&#10005;';
					removeButton.style.backgroundColor = 'red';
					removeButton.style.color = 'white';
					removeButton.style.width = '18px';
					removeButton.style.height = '18px';
					removeButton.style.fontSize = '10px';
					removeButton.style.borderRadius = '3px';
					removeButton.style.border = 'none';
					removeButton.style.display = 'flex';
					removeButton.style.justifyContent = 'center';
					removeButton.style.alignItems = 'center';
					removeButton.style.padding = '0';
					removeButton.style.cursor = 'pointer';
					removeButton.style.fontWeight = 'bold';
					removeButton.style.lineHeight = '1';
					removeButton.style.position = 'absolute';
					removeButton.style.top = '8px';
					removeButton.style.right = '8px';
					
					// 修改删除按钮点击事件
					removeButton.addEventListener('click', () => {
					    // 移除消息
						newMessage.remove();
						
						// 清除消息与图表的关联
						delete messageAnnotationMap[messageId];
						
						// 恢复原始图表
						const originalSpec = originalVisualizations[visID];
						if (originalSpec) {
                            console.log('删除时恢复原始图表:', visID);
                            const event = new CustomEvent('newVega-message', { 
                                detail: [originalSpec, visID] 
                            });
                            document.body.dispatchEvent(event);
                        }
					});
					
					newMessage.appendChild(removeButton);
					speechResult.appendChild(newMessage);
                })
                .catch(error => {
                    console.error('处理API响应时出错:', error);
                });
        })
        .catch(error => {
            console.error('获取CSV数据时出错:', error);
        });
}