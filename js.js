const apiResponseDict = {}
const vlSpecDict = {}

function decodeAsciiString(asciiString) {
	// Define a function to convert HTML entities to their character representation
	function entityToChar(match, num) {
		return String.fromCharCode(Number(num));
	}
	// Use regular expression to find all HTML entities in the string
	const pattern = /&#(\d+);/g;
	// Replace each HTML entity with its corresponding character
	const decodedString = asciiString.replace(pattern, entityToChar);

	return decodedString;
}

function getResponse(str) {
	// console.log(str)
	var index = str.indexOf("### Response:\n");
	if (index !== -1) {
		return str.substring(index + "### Response\n".length);
	} else {
		return "### Response: not found";
	}
}
const openai_key="&#66;&#101;&#97;&#114;&#101;&#114;&#32;&#115;&#107;&#45;&#112;&#114;&#111;&#106;&#45;&#48;&#74;&#73;&#106;&#57;&#65;&#45;&#74;&#48;&#95;&#75;&#111;&#104;&#77;&#72;&#71;&#80;&#109;&#56;&#110;&#49;&#95;&#83;&#111;&#72;&#83;&#67;&#69;&#56;&#108;&#98;&#110;&#105;&#48;&#120;&#122;&#55;&#73;&#49;&#52;&#52;&#73;&#56;&#115;&#51;&#65;&#45;&#68;&#87;&#52;&#70;&#105;&#97;&#84;&#71;&#71;&#48;&#101;&#84;&#51;&#66;&#108;&#98;&#107;&#70;&#74;&#52;&#53;&#53;&#95;&#88;&#66;&#65;&#84;&#118;&#78;&#80;&#73;&#88;&#82;&#49;&#55;&#121;&#117;&#103;&#69;&#52;&#117;&#107;&#112;&#89;&#118;&#116;&#74;&#48;&#84;&#83;&#78;&#117;&#110;&#83;&#121;&#48;&#85;&#99;&#57;&#55;&#108;&#54;&#87;&#89;&#88;&#83;&#76;&#87;&#67;&#73;&#120;&#66;&#67;&#117;&#114;&#52;&#65;"
function callApi(spec, visID) {
	// console.log(spec)
	vegaEmbed('#visPlayground', JSON.parse(spec)).then(result => {
		const view = result.view;
		// Convert Vega view to Canvas
		view.toCanvas()
			.then(function (canvas) {
				const canvasElement = document.getElementById('canvas');
				canvasElement.width = canvas.width;
				canvasElement.height = canvas.height;
				const ctx = canvasElement.getContext('2d');
				ctx.drawImage(canvas, 0, 0);
				// Convert canvas to JPEG and get the Base64 string
				const base64Image = canvasElement.toDataURL('image/jpeg').split(',')[1];
				// console.log("Base64 Encoded JPEG:", base64Image);
				// Make the API call using the Base64-encoded image
				fetch("https://api.openai.com/v1/chat/completions", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": decodeAsciiString(openai_key)
					},
					body: JSON.stringify({
						model: "gpt-4o-mini",
						messages: [
							{
								role: "user",
								content: [
									{
										type: "text",
										text: "Given a chart image, list data facts from general to detailed. The following are some data fact examples of different kinds. #COMPARE: The ticket price shown for 2006 is just over 60 dollars, and it rises from that point to just over 100 dollars in 2018. #TREND: Viewers of Minecraft on twitch has gradually increased between 2018 and 2020. #RANGE: Consumption was fairly stable between 2000 and 2005. #FILTER: The majorly of the big cities are higher than 3 index points. #RETRIEVE: Omsk has the largest value of 3.5 index points. Please briefly respond without any # tags, and each sentence should end with a period:"
									},
									{
										type: "image_url",
										image_url: {
											url: `data:image/jpeg;base64,${base64Image}`,
											detail: "low"
										}
									}
								]
							}
						],
						max_tokens: 200,
						temperature: 0
					})
				})
				.then(response => response.json())
				.then(data => {
					console.log(data);
					// let response = JSON.stringify(data["generated_text"], null, 2);
					// console.log(response);
					let response=data['choices'][0]['message']['content']
					apiResponseDict[visID] = response;
					vlSpecDict[visID] = spec;
					let responseList = response.split('. ').filter(Boolean)
					apiResponseDict[visID] = responseList
					generateButtons(responseList, visID, spec);
				})
				.catch(error => {
					console.log(`Error calling API: ${error.message}`);
				});
			})
			.catch(function (error) {
				console.error("Error converting Vega-Lite spec to canvas:", error);
			});
	}).catch(console.error);
}


let hf_key = "&#66;&#101;&#97;&#114;&#101;&#114;&#32;&#104;&#102;&#95;&#122;&#115;&#101;&#65;&#83;&#113;&#90;&#113;&#66;&#70;&#106;&#112;&#78;&#83;&#117;&#121;&#118;&#99;&#113;&#69;&#97;&#119;&#84;&#75;&#97;&#68;&#70;&#79;&#71;&#103;&#73;&#121;&#87;&#102;"
async function query(data) {
	const response = await fetch(
		"https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
		{
			headers: { Authorization: decodeAsciiString(hf_key) },
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.json();
	return result;
}

function indexOfMax(arr) {
	if (arr.length === 0) {
		return -1; // Return -1 for empty array
	}

	const max = Math.max(...arr); // Find the maximum value in the array
	return arr.indexOf(max); // Find the index of the maximum value
}

function getColumn(csvData) {
	// Split the CSV data into rows
	let rows = csvData.split('\n');
	let xList = [];
	let yList = [];
	for (let i = 0; i < rows.length; i++) {
		let columns = rows[i].split(',');
		if (columns[0] !== undefined) {
			xList.push(columns[0]);
		}
		if (columns[1] !== undefined) {
			yList.push(columns[1]);
		}
	}
	return [xList, yList];
}

let aiAssistActive = false;
let aiAssistProcessing = false;

function generateButtons(responseList, visID, spec) {
	const buttonContainer = document.getElementById('buttonContainer');
	while (buttonContainer.firstChild) {
		buttonContainer.removeChild(buttonContainer.firstChild);
	}

	const aiAssistButton = document.createElement('button');
	aiAssistButton.classList.add('AI-sight-Button');
	aiAssistButton.textContent = 'AI-sight';
	//   aiAssistButton.style.backgroundColor = 'grey';
	// Add the click event listener
	aiAssistButton.addEventListener('click', (e) => {
		e.stopPropagation(); // Stop event propagation to prevent multiple triggers
		if (aiAssistProcessing) {
			return; // Skip if already processing
		}
		aiAssistProcessing = true;
		// Trigger a custom event instead of handling logic here
		const aiAssistEvent = new CustomEvent('aiAssistToggle');
		aiAssistButton.dispatchEvent(aiAssistEvent);

		// Reset the flag after a short delay
		setTimeout(() => {
			aiAssistProcessing = false;
		}, 100); // Adjust the delay as needed
	});

	// Add a listener for the custom event
	aiAssistButton.addEventListener('aiAssistToggle', (e) => {
		aiAssistActive = !aiAssistActive;
		console.log('AI-sight Active:', aiAssistActive); // Logging the state
		if (aiAssistActive) {
			aiAssistButton.style.backgroundColor = '#f2ca3a';
			// Generate the response buttons
			responseList.forEach((response, index) => {
				const button = document.createElement('button');
				button.classList.add('Response-Button');
				button.textContent = responseList[index];
				button.addEventListener('click', () => {
					aiAssistActive = false;
					highLight(responseList[index], visID, spec);
					aiAssistButton.style.backgroundColor = '#787878'
					toggleButtonsVisibility(false);
				});
				buttonContainer.appendChild(button);
			});
		} else {
			aiAssistButton.style.backgroundColor = '#787878'
			toggleButtonsVisibility(false);
		}
	});

	buttonContainer.appendChild(aiAssistButton);
}

function toggleButtonsVisibility(show) {
	const buttons = document.querySelectorAll('.Response-Button');
	buttons.forEach(button => {
		button.style.display = show ? 'inline-block' : 'none';
	});
}



let recognition; // Declare recognition object

document.body.addEventListener('vl-spec', function (e) {
	vl_spec = e.detail.text;
});


// Function to start speech recognition
function startSpeechRecognition(spec, visID) {
	recognition = new webkitSpeechRecognition(); // Create speech recognition object
	recognition.lang = 'en-US'; // Set recognition language
	recognition.start(); // Start recognition
	console.log('Speech Starts...');
	// Event listener for speech recognition result
	recognition.onresult = function (event) {
		// console.log(event)
		const transcript = event.results[0][0].transcript; // Get transcript
		// const speechResult = document.getElementById('speech-result');
		// speechResult.innerHTML = transcript; // Display transcript
		// const responseList = processResponseList(apiResponseDict[visID].slice(1, (response.length - 1)).split('. ').filter(Boolean));

		// query({
		// 	"inputs": {
		// 		"source_sentence": transcript,
		// 		"sentences": responseList
		// 	}
		// }).then((response) => {
		// 	highLight(response, visID, spec)
		// });
		highLight(transcript, visID, spec)
	};

	// Event listener for speech recognition error
	recognition.onerror = function (event) {
		const speechResult = document.getElementById('speech-result');
		speechResult.innerHTML = `<p style="color: red;">Error: ${event.error}</p>`;
	};
}

// Function to stop speech recognition
function stopSpeechRecognition() {
	if (recognition) {
		recognition.stop(); // Stop recognition
	}
}

// // Event listener for button mousedown event
// document.getElementById('speech-button').addEventListener('mousedown', function () {
//   startSpeechRecognition(vl_spec);
//   document.getElementById('speech-button').innerHTML = 'Recording...';
// });

// // Event listener for button mouseup event
// document.getElementById('speech-button').addEventListener('mouseup', function () {
//   stopSpeechRecognition();
//   document.getElementById('speech-button').innerHTML = 'Start Recording';
// });

document.body.addEventListener('newVega-message', (e) => {
	// messages.push(e.detail);
	console.log('e-msg', e)
	// rerender();
	reRenderVegaLite(e.detail[0], e.detail[1]);
	// callApi();
});