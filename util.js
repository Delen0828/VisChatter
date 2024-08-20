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
renderButton.addEventListener('click', async function (e) {
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
            const vegaEvent = new CustomEvent('vl-spec', { detail: msgData, id:uniqueId });
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
const specPool={}
document.body.addEventListener('vl-spec', (e) => {
    if (!specPool[e.detail.id]) {
        renderVegaLite(e.detail.text);
        specPool[e.detail.id]=e.detail;
    }
    else{
        console.log('Existing chart:',e.detial.id);
    }
});

function highLightHelper(visID, task, vega, mainField, subField, mainType, subType, newList, xList, yList,taskList) {
	// console.log('newList',newList)
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
            let newVega = barThreshold(vega, subField, newList[0]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'TREND') {
            let newVega = barTrend(vega, mainType, newList[0], newList[1]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'RANGE') {
            let newVega = barRange(vega, subField, newList[0], newList[1]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
    }
    if (vega["mark"] == 'line' || vega["mark"] == 'area') {
        if (task == 'RETRIEVE') {
            let newVega = lineHighlightOne(vega, mainField, subField, mainType, subType, newList[0], xList);
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
                let newVega = lineTrend(vega,taskList[1], mainField, subField, mainType, subType, newList[1], newList[2], xList, yList);
                const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
                document.body.dispatchEvent(event);
            }
            else {
                let newVega = lineTrend(vega, taskList[1], mainField, subField, mainType, subType,xList[0],xList[xList.length - 1], xList, yList);
                const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
                document.body.dispatchEvent(event);
            }
        }
        if (task == 'RANGE') {
            let newVega = lineRange(vega, mainField, newList[0], newList[1], xList, yList);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
    }
    if (vega["mark"] == "scatter") {
        if (task == 'RETRIEVE') {
            let newVega = scatterHighlightOne(vega, mainField, subField, newList[0]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'COMPARE') {
            let newVega = scatterCompareTwo(vega, mainField, subField, newList[0], newList[1]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'FILTER') {
            let newVega = scatterThreshold(vega, subField, newList[0]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'TREND') { //TODO:check whether need to be taken out of the bracket
            let newVega = scatterTrend(vega, mainField, subField);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
        if (task == 'RANGE') {
            let newVega = scatterRange(vega, subField, newList[0], newList[1]);
            const event = new CustomEvent('newVega-message', { detail: [newVega, visID] });
            document.body.dispatchEvent(event);
        }
    }
}

function highLight(response, visID, spec) {
    // console.log('Highlighting:',JSON.stringify(response));
    // const matchContainer = document.getElementById("match-sentence");
    const target = response;
    fetch(JSON.parse(spec)["data"]["url"])
        .then(response => response.text())
        .then(csvData => {
            // Remove all commas and newlines
            // const DataTable = csvData.replace(/[\n,]/g, ' ');
            let [xList, yList] = getColumn(csvData);
            // console.log(target, xList)
            fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": decodeAsciiString(openai_key),
                },
                body: JSON.stringify({
                    model: "gpt-4-turbo",
                    messages: [
                        { role: "system", content: "You are a helpful assistant for labeling datasets.  Return only the label without explanation." },
                        { role: "user", content: "You need to label FACT with different tasks and retrieve key values or words from DATA. The tasks include: RETRIEVE (value or word), COMPARE (value1, value2 or word1, word2), FILTER (value), TREND (INCREASE or DECREASE, (value1 and value2) is optional), RANGE (value1, value2)." },
                        { role: "assistant", content: "I understand. I will just classify." },
                        { role: "user", content: "FACT: The ticket price shown for 2006 is just over 60 dollars, and it rises from that point to just over 100 dollars in 2018. DATA: Year Ticket price in U.S. dollars Dec 31, 2005 62.38 Dec 31, 2006 67.11 Dec 31, 2007 72.2 Dec 31, 2008 74.99 Dec 31, 2009 76.47 Dec 31, 2010 77.34 Dec 31, 2011 78.38 Dec 31, 2012 81.54 Dec 31, 2013 84.43 Dec 31, 2014 85.83 Dec 31, 2015 92.98 Dec 31, 2017 100.26 Dec 31, 2018 102.35" },
                        { role: "assistant", content: "COMPARE, 2006, 2018" },
                        { role: "user", content: "FACT: Viewers of Minecraft on twitch has gradually increased between 2018 and 2020. DATA: Month Number of viewers in thousands Dec 31, 2017 5.37 Jan 31, 2018 4.96 Feb 28, 2018 4.87 Mar 31, 2018 5.55 Apr 30, 2018 4.13 May 31, 2018 4.27 Jun 30, 2018 7.06 Jul 31, 2018 7.17 Aug 31, 2018 5.6 Sep 30, 2018 5.91 Oct 31, 2018 5.96 Nov 30, 2018 8.58 Dec 31, 2018 14.53 Jan 31, 2019 9.33 Feb 28, 2019 7.31 Mar 31, 2019 8.55 Apr 30, 2019 11.98 May 31, 2019 23.72 Jun 30, 2019 25.15 Jul 31, 2019 44.01 Aug 31, 2019 32.79 Sep 30, 2019 20.32 Oct 31, 2019 21.92 Nov 30, 2019 22.81 Dec 31, 2019 25.18 Jan 31, 2020 24.7 Feb 29, 2020 30.82 Mar 31, 2020 57.2 Apr 30, 2020 55.28 May 31, 2020 54.01 Jun 30, 2020 71.07 Jul 31, 2020 54.16 Aug 31, 2020 54.13 Sep 30, 2020 66.99 Oct 31, 2020 106.29" },
                        { role: "assistant", content: "TREND, INCREASE, 2018, 2020" },
                        { role: "user", content: "FACT: There are thousands of Bayern Munich fans and this number has seen a steady growth over the last twelve years. DATA: Number of fan club members in thousands Season 350.92 Nov 2018 340.47 2017/18 330.56 2016/17 325.42 2015/16 306.77 2014/15 283.56 2013/14 262.08 2012/13 231.2 2011/12 204.24 2010/11 190.75 2009/10 181.69 2008/09 176.98 2007/08 164.58 2006/07 156.67 2005/06" },
                        { role: "assistant", content: "TREND, INCREASE" },
                        { role: "user", content: "FACT: Consumption was fairly stable between 2000 and 2005. DATA: Per capita consumption of fresh sweet corn in the United States from 2000 to 2019 (in pounds) <s> Year Per capita consumption in pounds Dec 31, 1999 9 Dec 31, 2000 9.2 Dec 31, 2001 9 Dec 31, 2002 9.2 Dec 31, 2003 9 Dec 31, 2004 8.7 Dec 31, 2005 8.3 Dec 31, 2006 9.2 Dec 31, 2007 9.1 Dec 31, 2008 9.2 Dec 31, 2009 9.2 Dec 31, 2010 8.2 Dec 31, 2011 8.7 Dec 31, 2012 8.9 Dec 31, 2013 7.6 Dec 31, 2014 8.6 Dec 31, 2015 7.2 Dec 31, 2016 7.2 Dec 31, 2017 6.8 Dec 31, 2018 6.77" },
                        { role: "assistant", content: "RANGE, 2000, 2005" },
                        { role: "user", content: "FACT: The majorly of the big cities are higer than 3 index points. DATA: big city Index points Omsk 3.6 Novosibirsk 3.4 Krasnoyarsk 3.2 Volgograd 3.1 Perm 3.1 Voronezh 3.1 Nizhny Novgorod 3 Samara 3 Ufa 3 Yekaterinburg 3 Saint Petersburg 3 Rostov-on-Don 3 Chelyabinsk 3 Moscow 2.9 Kazan 2.6" },
                        { role: "assistant", content: "FILTER, 3" },
                        { role: "user", content: "FACT: Omsk has the largest value of 3.5 index points. DATA: big city Index points Omsk 3.6 Novosibirsk 3.4 Krasnoyarsk 3.2 Volgograd 3.1 Perm 3.1 Voronezh 3.1 Nizhny Novgorod 3 Samara 3 Ufa 3 Yekaterinburg 3 Saint Petersburg 3 Rostov-on-Don 3 Chelyabinsk 3 Moscow 2.9 Kazan 2.6" },
                        { role: "assistant", content: "RETRIEVE, Omsk" },
                        { role: "user", content: `FACT: ${target} DATA: ${xList}` }, // Using the target message here
                    ],
                    temperature: 0.5
                }),
            }).then(response => response.json())
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
                            let [xList, ylist] = getColumn(csvData).filter(item => item !== '');
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
                                        console.log(JSON.stringify(response));
                                        return xList[indexOfMax(response)];
                                    }));
                            }
                            return Promise.all(queryPromises)
                                .then(results => {
                                    newList.push(...results);
                                    // console.log('vissss', visID);
                                    highLightHelper(visID, taskList[0], vega, mainField, subField, mainType, subType, newList, xList, yList,taskList)
                                });
                        })
                });
        });
}