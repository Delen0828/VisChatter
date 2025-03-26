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
