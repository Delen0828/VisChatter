function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, initialX, initialY;

  element.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Calculate initial offset of the mouse click within the element
    initialX = e.clientX - element.getBoundingClientRect().left;
    initialY = e.clientY - element.getBoundingClientRect().top;

    const onMouseMove = (e) => {
      if (isDragging) {
        // Calculate the new position
        const currentX = e.clientX;
        const currentY = e.clientY;

        // Calculate the potential new position of the element
        let newLeft = currentX - initialX;
        let newTop = currentY - initialY;

        // Get container dimensions
        const container = element.parentElement;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        // console.log(elementRect)
        // Prevent the element from moving out of the container's left/right borders
        if (newLeft < 0) newLeft = 0;
        if (newLeft + elementRect.width > containerRect.width) {
          newLeft = containerRect.width - elementRect.width;
        }

        // Prevent the element from moving out of the container's top/bottom borders
        if (newTop < 0) newTop = 0;
        if (newTop + elementRect.height > containerRect.height) {
          newTop = containerRect.height - elementRect.height;
        }

        // Set the element's position
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}


function makeSelectable(element) {
  element.addEventListener('mousedown', (e) => {
    // Call startSpeechRecognition with the uniqueId
	if (e.button !== 0) return; // Only handle left-click
    let uniqueId = element.id;
    let vlSpec = element.getAttribute('data-vl-spec');
    startSpeechRecognition(vlSpec, uniqueId);
    e.stopPropagation(); // Prevent the click from propagating to the container
    // Add the 'selected' class to the clicked element
    element.classList.add('selected');
    // Change the border of the selected element
    element.style.border = '2px solid #000';
  });

  element.addEventListener('mouseup', function () {
	// if (e.button !== 0) return; // Only handle left-click
    stopSpeechRecognition();
    // Remove the 'selected' class from all elements
    document.querySelectorAll('.draggable-chart').forEach(div => {
    div.classList.remove('selected');
      // Reset border for all elements
	div.style.border = '0px solid #ccc';
    });
  });
}

// const recordButton = document.getElementById('recordButton');
// let isRecording = false;

// recordButton.addEventListener('click', () => {
//   if (!isRecording) {
//     // Start speech recognition
//     startSpeechRecognition();
//     isRecording = true;
//     recordButton.textContent = '🛑 Stop';
//     recordButton.classList.add('active');
//   } else {
//     // Stop speech recognition
//     stopSpeechRecognition();
//     isRecording = false;
//     recordButton.textContent = '🎤 Record';
//     recordButton.classList.remove('active');
//   }
// });
// function makeHoverable(element) {
//   // Ensure the parent element is absolutely positioned
//   element.style.position = 'absolute';

//   // Create a record button and append it to the element
//   const recordButton = document.createElement('button');
//   recordButton.textContent = '🎤 Record';
//   recordButton.style.position = 'absolute';
//   recordButton.style.top = '-30px'; // Position above the element
//   recordButton.style.left = '50%'; // Center horizontally
//   recordButton.style.transform = 'translateX(-50%)';
//   recordButton.style.padding = '5px 10px';
//   recordButton.style.border = 'none';
//   recordButton.style.borderRadius = '5px';
//   recordButton.style.backgroundColor = '#5cae5f';
//   recordButton.style.color = '#fff';
//   recordButton.style.cursor = 'pointer';
//   recordButton.style.display = 'none'; // Initially hidden
//   recordButton.style.zIndex = '10';
//   element.appendChild(recordButton);

//   // Add hover event listeners
//   element.addEventListener('mouseenter', () => {
//     element.classList.add('hovered'); // Add 'hovered' class
//     recordButton.style.display = 'block'; // Show the record button
//   });

//   element.addEventListener('mouseleave', () => {
//     element.classList.remove('hovered'); // Remove 'hovered' class
//     recordButton.style.display = 'none'; // Hide the record button
//   });

//   // Add click event listener to the record button
//   let isRecording = false;
//   recordButton.addEventListener('click', (e) => {
//     e.stopPropagation(); // Prevent click from propagating to the element
//     let uniqueId = element.id;
//     let vlSpec = element.getAttribute('data-vl-spec');

//     if (!isRecording) {
//       // Start speech recognition
//       startSpeechRecognition(vlSpec, uniqueId);
//       isRecording = true;
//       recordButton.textContent = '🛑 Stop';
//       recordButton.style.backgroundColor = '#ff4d4d';
//     } else {
//       // Stop speech recognition
//       stopSpeechRecognition();
//       isRecording = false;
//       recordButton.textContent = '🎤 Record';
//       recordButton.style.backgroundColor = '#5cae5f';
//     }
//   });
// }