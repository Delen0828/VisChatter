// Helper function to extract position from transform matrix
function getElementPosition(element) {
  const transform = window.getComputedStyle(element).transform;
  if (transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)') {
    return { x: 0, y: 0 };
  }
  
  try {
    const matrix = transform.match(/matrix.*\((.+)\)/)[1].split(', ');
    return { 
      x: parseFloat(matrix[4]) || 0, 
      y: parseFloat(matrix[5]) || 0 
    };
  } catch (e) {
    return { x: 0, y: 0 };
  }
}

function makeDraggable(element) {
  let isDragging = false;
  let animationFrameId = null;
  let containerRect, elementRect, elementWidth, elementHeight;
  let initialX, initialY;
  let lastX, lastY;

  element.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only handle left-click
    
    isDragging = true;
    
    // Cache DOM measurements once at drag start
    const container = element.parentElement;
    containerRect = container.getBoundingClientRect();
    elementRect = element.getBoundingClientRect();
    elementWidth = elementRect.width;
    elementHeight = elementRect.height;

    // Get current element position from transform matrix
    const currentPos = getElementPosition(element);
    
    // Calculate initial offset of the mouse click within the element
    // Use the actual visual position (elementRect) minus current transform position
    initialX = e.clientX - elementRect.left;
    initialY = e.clientY - elementRect.top;

    // Disable transitions during drag
    element.style.transition = 'none';
    
    // Initialize last position based on current transform position
    lastX = currentPos.x;
    lastY = currentPos.y;
    
    // Ensure element uses only transform positioning
    element.style.left = '0';
    element.style.top = '0';
    if (currentPos.x !== 0 || currentPos.y !== 0) {
      element.style.transform = `translate3d(${currentPos.x}px, ${currentPos.y}px, 0)`;
    } else {
      // If no transform exists, initialize with left/top values
      const computedStyle = window.getComputedStyle(element);
      const currentLeft = parseInt(computedStyle.left) || 0;
      const currentTop = parseInt(computedStyle.top) || 0;
      lastX = currentLeft;
      lastY = currentTop;
      element.style.transform = `translate3d(${currentLeft}px, ${currentTop}px, 0)`;
    }

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      // Use requestAnimationFrame for smooth updates
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        if (!isDragging) return;
        
        // Calculate the potential new position of the element
        let newLeft = e.clientX - initialX;
        let newTop = e.clientY - initialY;

        // Prevent the element from moving out of the container's borders
        if (newLeft < 0) newLeft = 0;
        if (newLeft + elementWidth > containerRect.width) {
          newLeft = containerRect.width - elementWidth;
        }

        if (newTop < 0) newTop = 0;
        if (newTop + elementHeight > containerRect.height) {
          newTop = containerRect.height - elementHeight;
        }

        // Only update if position actually changed
        if (newLeft !== lastX || newTop !== lastY) {
          // Use transform for hardware acceleration
          element.style.transform = `translate3d(${newLeft}px, ${newTop}px, 0)`;
          lastX = newLeft;
          lastY = newTop;
        }
      });
    };

    const onMouseUp = () => {
      isDragging = false;
      
      // Cancel any pending animation frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      // Re-enable transitions after drag completes
      element.style.transition = '';
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}


function makeSelectable(element) {
  element.addEventListener('click', (e) => {
    if (e.button !== 0) return; // Only handle left-click
    
    // 如果当前元素已经被选中，则取消选中
    if (element.classList.contains('selected')) {
      element.classList.remove('selected');
      element.style.border = '0px solid #ccc';
      return;
    }

    // 取消其他所有图表的选中状态
    document.querySelectorAll('.draggable-chart').forEach(div => {
      div.classList.remove('selected');
      div.style.border = '0px solid #ccc';
    });

    // 选中当前元素
    element.classList.add('selected');
    element.style.border = '2px solid #000';
    
    e.stopPropagation();
  });
}

// 添加全局点击事件监听器，用于处理点击空白处取消选择
document.addEventListener('click', (e) => {
  // 检查点击是否在按钮上
  if (e.target.closest('button')) {
    return; // 如果是按钮点击，不执行取消选择
  }

  // 检查点击是否在图表元素上
  const isClickOnChart = e.target.closest('.draggable-chart');
  
  // 如果点击不在图表上，则取消所有选择
  if (!isClickOnChart) {
    document.querySelectorAll('.draggable-chart').forEach(div => {
      div.classList.remove('selected');
      div.style.border = '0px solid #ccc';
    });
  }
});
