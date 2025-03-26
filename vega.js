const visContainer = document.getElementById('vis');
makeDraggable(visContainer);
makeSelectable(visContainer);
// makeHoverable(visContainer);
enableRightClickRemoval(visContainer);

// document.body.addEventListener('mouseup', () => {
//   // console.log('removing...')
//   document.querySelectorAll('.draggable-chart').forEach(div => {
//     div.classList.remove('selected');
//   });
// });

function renderVegaLite(spec) {
  const visContainer = document.getElementById('vis-container');
  const newDiv = document.createElement('div');
  newDiv.className = 'draggable-chart';
  newDiv.style.position = 'absolute';
  newDiv.style.left = '20px';  // 距离左边 20px
  newDiv.style.top = '20px';   // 距离顶部 20px
  
  // 生成唯一ID
  const uniqueId = `vis-${Math.floor(Date.now() / 1000)}`;
  newDiv.id = uniqueId;
  newDiv.setAttribute('data-vl-spec', spec);
  
  visContainer.appendChild(newDiv);
  
  try {
    const vegaLiteSpec = JSON.parse(spec);
    vegaEmbed(`#${uniqueId}`, vegaLiteSpec);
  } catch (error) {
    newDiv.innerHTML = `<p style="color: red;">Error rendering chart: ${error.message}</p>`;
  }  
  // Get the AI generated description (deceperated)
  callApi(spec,uniqueId);
  // Make the new div draggable and selectable
  makeDraggable(newDiv);
  makeSelectable(newDiv);
  enableRightClickRemoval(newDiv)
}

function reRenderVegaLite(spec, uniqueId) {
  console.log(spec,uniqueId)
  try {
    // const vegaLiteSpec = JSON.parse(spec);
    console.log(spec);
    vegaEmbed(`#${uniqueId}`, spec);
  } catch (error) {
    const newDiv = document.getElementById(uniqueId);
    newDiv.innerHTML = `<p style="color: red;">Error rendering chart: ${error.message}</p>`;
  }
}