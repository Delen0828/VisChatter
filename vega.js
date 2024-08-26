const visContainer = document.getElementById('vis');
makeDraggable(visContainer);
makeSelectable(visContainer);
enableRightClickRemoval(visContainer);

document.body.addEventListener('mouseup', () => {
  // console.log('removing...')
  document.querySelectorAll('.draggable-chart').forEach(div => {
    div.classList.remove('selected');
  });
});

function renderVegaLite(spec) {
  const visContainer = document.getElementById('vis-container');
  const newDiv = document.createElement('div');
  newDiv.className = 'draggable-chart';
  newDiv.style.position = 'absolute';
  // Generate a unique ID for the new div
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
  // Get the AI generated description 
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