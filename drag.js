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
	// Remove all buttons of AI-sight
	const buttonContainer = document.getElementById('buttonContainer');
	while (buttonContainer.firstChild) {
		buttonContainer.removeChild(buttonContainer.firstChild);
	}
    // Call startSpeechRecognition with the uniqueId
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
    stopSpeechRecognition();
    // Remove the 'selected' class from all elements
    document.querySelectorAll('.draggable-chart').forEach(div => {
      div.classList.remove('selected');
      // Reset border for all elements
      div.style.border = '0px solid #ccc';
    });
	//Add buttons to AI-sight
	let visID=element.id
	let responseList=apiResponseDict[visID]
	let spec = element.getAttribute('data-vl-spec');
	// let aiAssistActive = false;
	// let aiAssistProcessing = false; 
	generateButtons(responseList, visID, spec) 
  });
}