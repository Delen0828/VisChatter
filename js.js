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
const openai_yek = "&#66;&#101;&#97;&#114;&#101;&#114;&#32;&#115;&#107;&#45;&#112;&#114;&#111;&#106;&#45;&#51;&#50;&#107;&#119;&#111;&#121;&#114;&#51;&#105;&#104;&#121;&#76;&#90;&#107;&#85;&#105;&#88;&#84;&#113;&#113;&#77;&#71;&#111;&#82;&#109;&#117;&#73;&#49;&#65;&#115;&#66;&#107;&#77;&#122;&#106;&#112;&#81;&#108;&#113;&#114;&#72;&#108;&#75;&#118;&#79;&#88;&#69;&#120;&#118;&#88;&#77;&#55;&#109;&#116;&#65;&#50;&#100;&#71;&#84;&#51;&#66;&#108;&#98;&#107;&#70;&#74;&#118;&#110;&#102;&#45;&#106;&#99;&#84;&#86;&#90;&#118;&#69;&#68;&#122;&#68;&#65;&#86;&#75;&#75;&#69;&#56;&#53;&#117;&#73;&#48;&#79;&#105;&#109;&#105;&#121;&#110;&#56;&#79;&#77;&#85;&#84;&#115;&#87;&#53;&#112;&#104;&#76;&#49;&#88;&#80;&#120;&#48;&#111;&#119;&#51;&#48;&#51;&#90;&#98;&#55;&#53;&#114;&#115;&#65;"

function callApi(spec, visID) {
	vlSpecDict[visID] = spec;
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
	let colNum = rows[0].split(',').length
	if (colNum == 2) {
		let xList = [];
		let yList = [];
		for (let i = 1; i < rows.length; i++) {
			let columns = rows[i].split(',');
			if (columns[0] !== undefined) {
				xList.push(columns[0]);
			}
			if (columns[1] !== undefined) {
				yList.push(columns[1]);
			}
		}
		return [xList, yList, 'None', false];
	}
	else {
		let xList = [];
		let yList = [];
		let legendList=[]
		for (let i = 1; i < rows.length; i++) {
			let columns = rows[i].split(',');
			if (columns[0] !== undefined) {
				legendList.push(columns[0]);
			}
			if (columns[1] !== undefined) {
				xList.push(columns[1]);
			}
			if (columns[2] !== undefined) {
				yList.push(columns[2]);
			}
		}
		return [xList,yList,legendList,true]
	}
}

let aiAssistActive = false;
let aiAssistProcessing = false;

// function generateButtons(responseList, visID, spec) {
// 	const buttonContainer = document.getElementById('buttonContainer');
// 	while (buttonContainer.firstChild) {
// 		buttonContainer.removeChild(buttonContainer.firstChild);
// 	}

	// const aiAssistButton = document.createElement('button');
	// aiAssistButton.classList.add('AI-sight-Button');
	// aiAssistButton.textContent = 'AI-sight';
	// //   aiAssistButton.style.backgroundColor = 'grey';
	// // Add the click event listener
	// aiAssistButton.addEventListener('mouseup', (e) => {
	// 	e.stopPropagation(); // Stop event propagation to prevent multiple triggers
	// 	if (aiAssistProcessing) {
	// 		return; // Skip if already processing
	// 	}
	// 	aiAssistProcessing = true;
	// 	// Trigger a custom event instead of handling logic here
	// 	const aiAssistEvent = new CustomEvent('aiAssistToggle');
	// 	aiAssistButton.dispatchEvent(aiAssistEvent);

	// 	// Reset the flag after a short delay
	// 	setTimeout(() => {
	// 		aiAssistProcessing = false;
	// 	}, 100); // Adjust the delay as needed
	// });

	// // Add a listener for the custom event
	// aiAssistButton.addEventListener('aiAssistToggle', (e) => {
	// 	aiAssistActive = !aiAssistActive;
	// 	console.log('AI-sight Active:', aiAssistActive); // Logging the state
	// 	if (aiAssistActive) {
	// 		aiAssistButton.style.backgroundColor = '#f2ca3a';
	// 		// Generate the response buttons
	// responseList.forEach((response, index) => {
	// 	const button = document.createElement('button');
	// 	button.classList.add('Response-Button');
	// 	button.textContent = responseList[index];
	// 	button.addEventListener('mouseup', () => {
	// 		aiAssistActive = false;
	// 		highLight(responseList[index], visID, spec);
	// 		aiAssistButton.style.backgroundColor = '#787878'
	// 		toggleButtonsVisibility(false);
	// 	});
	// 	buttonContainer.appendChild(button);
	// });
	// 	} else {
	// 		aiAssistButton.style.backgroundColor = '#787878'
	// 		toggleButtonsVisibility(false);
	// 	}
	// });

	// buttonContainer.appendChild(aiAssistButton);
// }

// function toggleButtonsVisibility(show) {
// 	const buttons = document.querySelectorAll('.Response-Button');
// 	buttons.forEach(button => {
// 		button.style.display = show ? 'inline-block' : 'none';
// 	});
// }



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
		highLight(transcript, visID, spec)
	};

	// Event listener for speech recognition error
	recognition.onerror = function (event) {
		console.log(event.error)
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