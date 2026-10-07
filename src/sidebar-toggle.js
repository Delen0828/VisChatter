document.addEventListener('DOMContentLoaded', function() {
    const leftSidebar = document.getElementById('background');
    const rightSidebar = document.getElementById('right-panel');
    const toggleLeft = document.getElementById('toggleLeft');
    const toggleRight = document.getElementById('toggleRight');
    const visContainer = document.getElementById('vis-container');

    function updateVisContainerSize() {
        const leftCollapsed = leftSidebar.classList.contains('collapsed');
        const rightCollapsed = rightSidebar.classList.contains('collapsed');
        
        let leftOffset = leftCollapsed ? 50 : 330;
        let rightOffset = rightCollapsed ? 50 : 290;
        
        visContainer.style.left = leftOffset + 'px';
        visContainer.style.right = rightOffset + 'px';
    }

    toggleLeft.addEventListener('click', function() {
        leftSidebar.classList.toggle('collapsed');
        updateVisContainerSize();
    });

    toggleRight.addEventListener('click', function() {
        rightSidebar.classList.toggle('collapsed');
        updateVisContainerSize();
    });

    updateVisContainerSize();
});