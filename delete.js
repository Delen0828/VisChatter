function enableRightClickRemoval() {
    const visContainer = document.getElementById('vis-container');

    visContainer.addEventListener('contextmenu', function(event) {
        event.preventDefault();  // Prevent the default right-click menu

        // Ensure the clicked element is a div with the draggable-chart class
        let targetElement = event.target;

        // Traverse up the DOM if the target element is not the div itself
        while (targetElement && !targetElement.classList.contains('draggable-chart')) {
            targetElement = targetElement.parentElement;
        }

        if (targetElement && targetElement.classList.contains('draggable-chart')) {
            const divId = targetElement.id;

            // Log the div ID and dictionary content for debugging
            // console.log(`Removing div with ID: ${divId}`);
            // console.log(`apiResponseDict before deletion:`, apiResponseDict);
            // console.log(`vlSpecDict before deletion:`, vlSpecDict);
            // console.log(msgPool)
            // Remove the div from the DOM
            targetElement.remove();

            // Remove the corresponding entries from the dictionaries
            delete apiResponseDict[divId];
            delete vlSpecDict[divId];
            delete msgPool[divId];
            delete specPool[divId];
            // Log dictionary content after deletion
            // console.log(`apiResponseDict after deletion:`, apiResponseDict);
            // console.log(`vlSpecDict after deletion:`, vlSpecDict);
            // console.log(msgPool)
        } else {
            console.log('Right-clicked element is not a draggable chart div.');
        }
    });
}