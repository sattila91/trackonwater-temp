let map;
// Initialize Google Map
function initMap() {
     map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 47.4979, lng: 19.0402 }, // Example: Budapest
        zoom: 8
    });
  map.addListener('zoom_changed', updateCircleSizes);

}


let fetchInterval = null;
let firstfetch = true;
let currentSortColumn = null;    // e.g. 0 for Tracker UID, 2 for Last Timestamp, etc.
let currentSortDirection = true;   // true for ascending, false for descending



// Start fetching only when the page is loaded and the user is authenticated
function startFetchingStats() {
    if (!fetchInterval) {
        if (firstfetch) {
            firstfetch = false;
            fetchdata(); // Fetch immediately
        }
        fetchInterval = setInterval(fetchdata, 5000); // Then fetch every 5 sec
    }
}

// Stop fetching (useful for logout)
function stopFetchingStats() {
    if (fetchInterval) {
        clearInterval(fetchInterval);
        fetchInterval = null;
    }
    firstfetch = true;
}

function fetchdata() {
    fetchStats();
    fetchTrackerData();
}

async function login(event) {
    event.preventDefault(); // Prevent form submission reload
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            sessionStorage.setItem('authToken', data.token); // Store JWT token in sessionStorage
            window.location.href = '/dashboard.html'; // Redirect to dashboard
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        console.error('Error during login:', error);
    }
}

function logout() {
    stopFetchingStats(); // Stop fetching stats 
    sessionStorage.removeItem('authToken'); // Clear JWT token
    window.location.href = '/index.html'; // Redirect to login page
}

const circles=[];
function updateMap(trackerData) {
  // Clear previous circles
  circles.forEach(circle => circle.setMap(null));
  circles.length = 0;

  trackerData.forEach(tracker => {
    if (tracker.data && tracker.data.lat && tracker.data.lon) {
      const position = { lat: tracker.data.lat, lng: tracker.data.lon };

      const circle = new google.maps.Circle({
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.35,
        map,
        center: position,
        radius: calculateRadius(), // Set initial radius based on current zoom
        title: tracker.tracker_uid,
      });

      // Add mouseover event to display info window
      const infoWindow = new google.maps.InfoWindow();
      circle.addListener('mouseover', (e) => {
        infoWindow.setContent(`Tracker UID: ${tracker.tracker_uid}`);
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);
      });

      // Add mouseout event to close info window
      circle.addListener('mouseout', () => {
        infoWindow.close();
      });

      circles.push(circle);
    }
  });
}


function calculateRadius() {
  const { width, height } = getMapDimensionsInKm();

  // Define the fraction of the map's dimension that the circle should occupy
  const fraction = 0.025; // For example, 5% of the map's dimension

  // Calculate the radius as the smaller fraction of width or height
  const radius = (Math.min(width, height) * fraction) * 1000; // Convert to meters

  return radius;
}


function getMapDimensionsInKm() {
  const bounds = map.getBounds();
  if (!bounds) return { width: 0, height: 0 };

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();

  // Calculate the distance between the northeast and southwest corners
  const width = google.maps.geometry.spherical.computeDistanceBetween(
    new google.maps.LatLng(ne.lat(), sw.lng()),
    new google.maps.LatLng(ne.lat(), ne.lng())
  ) / 1000; // Convert to kilometers

  const height = google.maps.geometry.spherical.computeDistanceBetween(
    new google.maps.LatLng(ne.lat(), sw.lng()),
    new google.maps.LatLng(sw.lat(), sw.lng())
  ) / 1000; // Convert to kilometers

  return { width, height };
}


function updateCircleSizes() {
  const zoom = map.getZoom();
  circles.forEach(circle => {
    circle.setRadius(calculateRadius());
  });
}


function focusOnTracker(tracker_uid, lat, lon) {
    if (!map) return;

    // Set map zoom and center to selected tracker
    map.setCenter({ lat, lng: lon });
    map.setZoom(15); // Adjust zoom level as needed

    // Remove highlight from all rows, then add highlight to selected row
    const rows = document.querySelectorAll("#trackerTable tbody tr");
    rows.forEach(row => row.classList.remove("selected"));

    const selectedRowCandidate = Array.from(rows).find(row => row.cells[0].textContent === tracker_uid);
    if (selectedRowCandidate) {
        selectedRowCandidate.classList.add("selected");
        selectedRow = selectedRowCandidate;  // Update global selectedRow variable
    }

    // Show the info window near the selected point
    const infoWindow = new google.maps.InfoWindow({
        content: `<strong>${tracker_uid}</strong> <br> Lat: ${lat}, Lon: ${lon}`
    });

    if (circles[tracker_uid]) {
        infoWindow.setPosition({ lat, lng: lon });
        infoWindow.open(map);
    }

    // Show "Clear Selection" button
    document.getElementById("clearSelectionButton").style.display = "block";
}


// Fetch statistics and update the chart
async function fetchStats() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }
    
    try {
        const response = await fetch('/admin/trackerstat', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // If the token is expired, the response status will likely be 401
        if (response.status === 401) {
            alert('Session expired. Please log in again.');
            logout();
            return;
        }
        
        const data = await response.json();
        
        if (response.ok) {
            updateChart(data);
        } else {
            alert('Failed to fetch stats: ' + data.error);
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}


// 1. Fetch device mapping (events: tracker IDs) and store globally.
async function fetchDevicesMapping() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }
    try {
        const response = await fetch('/admin/devices', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            const mapping = await response.json();
            window.devicesMapping = mapping; // e.g., { "tonw-0000": "maratongyor", ... }
        } else {
            console.error('Failed to fetch devices mapping:', response.statusText);
        }
    } catch (error) {
        console.error('Error fetching devices mapping:', error);
    }
}


async function fetchTrackerData() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }
    try {
        // First, fetch device mapping.
        await fetchDevicesMapping();
        
        // Then, fetch tracker data.
        const response = await fetch('/admin/trackerdata', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            updateTrackerTable(data);
            // updateMap() is called from updateTrackerTable via filtering functions.
        } else {
            alert('Failed to fetch tracker data: ' + data.error);
        }
    } catch (error) {
        console.error('Error fetching tracker data:', error);
    }
}

let chartInstance = null;

// Update the chart with fetched statistics
function updateChart(data) {
    const ctx = document.getElementById('msgChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.data.datasets[0].data = [
            data.totalMessages,
            data.invalidMessages,
            data.activeTrackers
        ];
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Total Messages', 'Invalid Messages', 'Active Trackers'],
                datasets: [{
                    label: 'Count',
                    data: [data.totalMessages, data.invalidMessages, data.activeTrackers],
                    backgroundColor: ['#77aaff', '#ff7777', '#77ff77'],
                    borderColor: ['#77aaff', '#ff7777', '#77ff77'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Update the tracker table with fetched data
let selectedRow = null;
function updateTrackerTable(trackerData) {
    const tableBody = document.getElementById('trackerTable').getElementsByTagName('tbody')[0];

    // Preserve current filter selection and the selected tracker UID (if any)
    const filterSelect = document.getElementById("trackerEventFilter");
    const currentFilter = filterSelect ? filterSelect.value : "";
    let previousSelectedTracker = null;
    const currentSelectedRow = document.querySelector("#trackerTable tbody tr.selected");
    if (currentSelectedRow) {
        previousSelectedTracker = currentSelectedRow.cells[0].textContent;
    }

    // Rebuild the table
    tableBody.innerHTML = "";
    trackerData.forEach(tracker => {
        const { tracker_uid, data, timestamp, messageCount } = tracker;
        // Cross-match with devices mapping to get the assigned event
        const eventAssigned = (window.devicesMapping && window.devicesMapping[tracker_uid]) || "";
        
        // Create a new row and set a data attribute for the event
        const row = tableBody.insertRow();
        row.setAttribute("data-event", eventAssigned);
        row.insertCell(0).textContent = tracker_uid;
        row.insertCell(1).textContent = JSON.stringify(data);
        row.insertCell(2).textContent = timestamp;
        row.insertCell(3).textContent = messageCount;
        
        // Add click event listener to focus on the tracker and highlight the row
        row.addEventListener("click", function () {
            if (data && data.lat && data.lon) {
                focusOnTracker(tracker_uid, data.lat, data.lon);
                highlightSelectedRow(row);
            }
        });
    });

    // Update the filter dropdown based on the new table data
    populateTrackerEventFilter();
    if (filterSelect) {
        filterSelect.value = currentFilter;
        filterTrackersByEvent();
    }

    // Re-select the previously selected row if it still exists
    if (previousSelectedTracker) {
        const newSelectedRow = Array.from(document.querySelectorAll("#trackerTable tbody tr"))
                                  .find(row => row.cells[0].textContent === previousSelectedTracker);
        if (newSelectedRow) {
            newSelectedRow.classList.add("selected");
            // Optionally zoom map to the selected tracker (if data is available)
            let parsedData = {};
            try {
                parsedData = JSON.parse(newSelectedRow.cells[1].textContent);
            } catch (e) { }
            if (parsedData.lat && parsedData.lon) {
                map.setCenter({ lat: parsedData.lat, lng: parsedData.lon });
                map.setZoom(15);
            }
            document.getElementById("clearSelectionButton").style.display = "block";
        }
    } else {
        const clearButton = document.getElementById("clearSelectionButton");
        if (clearButton) {
            clearButton.style.display = "none";
        }
    }
    
    // Reapply sorting using the stored sort column and direction.
    if (currentSortColumn !== null) {
        sortTable(currentSortColumn, true);
    }
}






function populateTrackerEventFilter() {
    const tbody = document.querySelector("#trackerTable tbody");
    if (!tbody) return;
  
    const eventsSet = new Set();
    Array.from(tbody.rows).forEach(row => {
        const eventVal = row.getAttribute("data-event");
        if (eventVal) eventsSet.add(eventVal);
    });
  
    const filterSelect = document.getElementById("trackerEventFilter");
    if (!filterSelect) return;
    // Clear existing options and add the default "All Events"
    filterSelect.innerHTML = '<option value="">All Events</option>';
    eventsSet.forEach(event => {
        const option = document.createElement("option");
        option.value = event;
        option.textContent = event;
        filterSelect.appendChild(option);
    });
}


function filterTrackersByEvent() {
    const filterValue = document.getElementById("trackerEventFilter").value;
    const tbody = document.querySelector("#trackerTable tbody");
    if (!tbody) return;
    
    // Clear current selection when filter changes.
    if (selectedRow) {
        selectedRow.classList.remove("selected");
        selectedRow = null;
        document.getElementById("clearSelectionButton").style.display = "none";
    }
    
    Array.from(tbody.rows).forEach(row => {
        const eventVal = row.getAttribute("data-event");
        row.style.display = (!filterValue || eventVal === filterValue) ? "" : "none";
    });
    
    // Build filtered data array and update the map.
    const filteredData = [];
    Array.from(tbody.rows).forEach(row => {
        if (row.style.display !== "none") {
            let trackerObj = {
                tracker_uid: row.cells[0].textContent,
                data: {},
                timestamp: row.cells[2].textContent,
                messageCount: row.cells[3].textContent
            };
            try {
                trackerObj.data = JSON.parse(row.cells[1].textContent);
            } catch (e) {
                trackerObj.data = {};
            }
            filteredData.push(trackerObj);
        }
    });
    resetMapAndSelection();
    //updateMap(filteredData);
}

// Function to highlight selected row and deselect previous one
function highlightSelectedRow(row) {
    if (selectedRow) {
        selectedRow.classList.remove("selected");
    }
    selectedRow = row;
    selectedRow.classList.add("selected");
    
    const clearButton = ensureClearSelectionButton();
    clearButton.style.display = "block";
}


function ensureClearSelectionButton() {
  let clearButton = document.getElementById("clearSelectionButton");
  if (!clearButton) {
    clearButton = document.createElement("button");
    clearButton.id = "clearSelectionButton";
    clearButton.textContent = "Clear Selection";
    clearButton.classList.add("clear-button");
    clearButton.style.display = "none";  // Initially hidden
    clearButton.addEventListener("click", resetMapAndSelection);
    document.querySelector(".tracker-data").appendChild(clearButton);
  }
  return clearButton;
}



// Function to add a clear selection button
function addClearSelectionButton() {
    let clearButton = document.getElementById("clearSelectionButton");

    if (!clearButton) {
        clearButton = document.createElement("button");
        clearButton.id = "clearSelectionButton";
        clearButton.textContent = "Clear Selection";
        clearButton.classList.add("clear-button");
        clearButton.style.display = "none";        
clearButton.addEventListener("click", resetMapAndSelection);

        document.querySelector(".tracker-data").appendChild(clearButton);
    }
}

// Function to reset the map and deselect any selected rows

function resetMapAndSelection() {
    if (selectedRow) {
        selectedRow.classList.remove("selected");
        selectedRow = null;
    }


    resetMapView();

    // Reset the map view to show the current filtered trackers
    const tbody = document.querySelector("#trackerTable tbody");
    const filteredData = [];
    Array.from(tbody.rows).forEach(row => {
        if (row.style.display !== "none") {
            let trackerObj = {
                tracker_uid: row.cells[0].textContent,
                data: {},
                timestamp: row.cells[2].textContent,
                messageCount: row.cells[3].textContent
            };
            try {
                trackerObj.data = JSON.parse(row.cells[1].textContent);
            } catch(e) {
                trackerObj.data = {};
            }
            filteredData.push(trackerObj);
        }
    });
    updateMap(filteredData);
    const clearButton = document.getElementById("clearSelectionButton");
    if (clearButton) {
        clearButton.style.display = "none";
    }
}



// Function to reset the map to default zoom and center
function resetMapView() {
    if (!map) return;

    map.setCenter({ lat: 47.4979, lng: 19.0402 }); // Default to Budapest or your preferred default location
    map.setZoom(8); // Default zoom level
}

document.body.addEventListener("click", function (event) {
    if (event.target.id === "clearSelectionButton") {
        resetMapAndSelection();
    }
});


function sortTable(columnIndex, preserve = false) {
    const table = document.getElementById("trackerTable");
    const tbody = table.getElementsByTagName("tbody")[0];
    const rows = Array.from(tbody.getElementsByTagName("tr"));

    // If not preserving, update the global sort settings.
    if (!preserve) {
        if (currentSortColumn === columnIndex) {
            currentSortDirection = !currentSortDirection;
        } else {
            currentSortColumn = columnIndex;
            currentSortDirection = true; // default to ascending
        }
    }
    
    // Sort rows based on currentSortDirection and columnIndex.
    rows.sort((rowA, rowB) => {
        let cellA = rowA.cells[columnIndex].textContent.trim();
        let cellB = rowB.cells[columnIndex].textContent.trim();
        // For a date column (for example, column 2), convert to Date objects:
        if (columnIndex === 2) {
            cellA = new Date(cellA);
            cellB = new Date(cellB);
        }
        if (currentSortDirection) {
            return cellA > cellB ? 1 : (cellA < cellB ? -1 : 0);
        } else {
            return cellA < cellB ? 1 : (cellA > cellB ? -1 : 0);
        }
    });

    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
}

if (window.location.pathname.includes('dashboard.html')) {
    startFetchingStats();
}


// --- Existing functions (map, stats, tracker data, login/logout, etc.) ---
// (Keep your existing code for initMap, fetchStats, fetchTrackerData, etc.)

// ================================
// API KEY MANAGEMENT (Frontend)
// ================================

/**
 * Fetch existing API keys from the backend and populate the API key table.
 */
async function fetchApiKeys() {
  const token = sessionStorage.getItem('authToken');
  if (!token) {
    alert('Unauthorized: Please log in first.');
    window.location.href = '/index.html';
    return;
  }
  try {
    const response = await fetch('/admin/apikeys', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (response.ok) {
      const apiKeys = await response.json();
      populateApiKeys(apiKeys);
    } else {
      console.error('Failed to fetch API keys:', response.statusText);
    }
  } catch (error) {
    console.error('Error fetching API keys:', error);
  }
}


/**
 * Populate the API key table with data.
 * Active keys are shown first (ordered by generatedAt descending),
 * followed by invalid keys (also ordered descending).
 * The table includes columns for Event, API Key, Generated At, Status, and Action.
 */
function populateApiKeys(apiKeys) {
  const tbody = document.querySelector('.api-key-management__table-body');
  if (!tbody) return;
  tbody.innerHTML = ""; // Clear existing rows

  // Partition the keys into active and invalid groups
  const activeKeys = apiKeys.filter(key => key.valid === true);
  const invalidKeys = apiKeys.filter(key => key.valid !== true);

  // Sort both groups by generatedAt in descending order (newest first)
  activeKeys.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  invalidKeys.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

  // Render active keys first
  activeKeys.forEach(key => {
    const tr = document.createElement("tr");
    tr.classList.add("api-key-management__table-row");

    // Event column
    const tdEvent = document.createElement("td");
    tdEvent.classList.add("api-key-management__table-cell");
    tdEvent.textContent = key.event;
    tr.appendChild(tdEvent);

    // API Key column
    const tdKey = document.createElement("td");
    tdKey.classList.add("api-key-management__table-cell");
    tdKey.textContent = key.apiKey;
    tr.appendChild(tdKey);

    // Generated At column
    const tdDate = document.createElement("td");
    tdDate.classList.add("api-key-management__table-cell");
    tdDate.textContent = key.generatedAt;
    tr.appendChild(tdDate);

    // Status column
    const tdStatus = document.createElement("td");
    tdStatus.classList.add("api-key-management__table-cell");
    tdStatus.textContent = "Active";
    tr.appendChild(tdStatus);

    // Action column with an "Invalidate" button for active keys
    const tdAction = document.createElement("td");
    tdAction.classList.add("api-key-management__table-cell");
    const invalidateButton = document.createElement("button");
    invalidateButton.textContent = "Invalidate";
    invalidateButton.classList.add("api-key-management__submit-button");
    invalidateButton.onclick = () => invalidateApiKey(key.id);
    tdAction.appendChild(invalidateButton);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  // Render invalid keys next; add a class for grey styling
  invalidKeys.forEach(key => {
    const tr = document.createElement("tr");
    tr.classList.add("api-key-management__table-row", "invalid-key");

    // Event column
    const tdEvent = document.createElement("td");
    tdEvent.classList.add("api-key-management__table-cell");
    tdEvent.textContent = key.event;
    tr.appendChild(tdEvent);

    // API Key column
    const tdKey = document.createElement("td");
    tdKey.classList.add("api-key-management__table-cell");
    tdKey.textContent = key.apiKey;
    tr.appendChild(tdKey);

    // Generated At column
    const tdDate = document.createElement("td");
    tdDate.classList.add("api-key-management__table-cell");
    tdDate.textContent = key.generatedAt;
    tr.appendChild(tdDate);

    // Status column
    const tdStatus = document.createElement("td");
    tdStatus.classList.add("api-key-management__table-cell");
    tdStatus.textContent = "Invalid";
    tr.appendChild(tdStatus);

    // Action column: no action button for invalid keys
    const tdAction = document.createElement("td");
    tdAction.classList.add("api-key-management__table-cell");
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });
}


/**
 * Invalidate an API key via a PUT request.
 */
async function invalidateApiKey(id) {
  const token = sessionStorage.getItem('authToken');
  if (!token) {
    alert('Unauthorized: Please log in first.');
    window.location.href = '/index.html';
    return;
  }
  try {
    const response = await fetch(`/admin/apikeys/${id}/invalidate`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (response.ok) {
      alert('API key invalidated.');
      fetchApiKeys(); // Refresh the API key table
    } else {
      alert('Error invalidating API key.');
    }
  } catch (error) {
    console.error('Error invalidating API key:', error);
  }
}

/**
 * Sorting for API key table.
 * Allows sorting by Event (column index 0) and Generated At (column index 2).
 */
let apiKeysSortDirection = {};

function sortApiKeysTable(columnIndex) {
  const table = document.querySelector('.api-key-management__table');
  const tbody = table.querySelector('.api-key-management__table-body');
  const rows = Array.from(tbody.getElementsByTagName('tr'));
  
  // Toggle sorting direction for the given column
  apiKeysSortDirection[columnIndex] = !apiKeysSortDirection[columnIndex];

  rows.sort((rowA, rowB) => {
    let cellA = rowA.cells[columnIndex].textContent.trim();
    let cellB = rowB.cells[columnIndex].textContent.trim();

    // For Generated At column, compare as dates
    if (columnIndex === 2) {
      cellA = new Date(cellA);
      cellB = new Date(cellB);
    }
    return apiKeysSortDirection[columnIndex]
      ? (cellA > cellB ? 1 : -1)
      : (cellA < cellB ? 1 : -1);
  });

  tbody.innerHTML = "";
  rows.forEach(row => tbody.appendChild(row));
}

// Attach event listener for API key form submission if present (for generating a new key)
document.addEventListener('DOMContentLoaded', () => {

  if (document.getElementById('trackerTable')) {
//      startFetchingStats();
//     ensureClearSelectionButton();
  }


  const apiKeyForm = document.getElementById('apiKeyForm');
  if (apiKeyForm) {
    apiKeyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventInput = document.getElementById('event').value.trim();
      if (eventInput) {
        await generateApiKey(eventInput);
      } else {
        alert('Please enter an event name.');
      }
    });
  }

 // Automatically fetch API keys if the API key table exists on the page.
  if (document.querySelector('.api-key-management__table-body')) {
    fetchApiKeys();
  }

});

/**
 * Generate a new API key for a given event.
 * This triggers the backend endpoint which invalidates any existing keys for the event.
 */
async function generateApiKey(eventName) {
  const token = sessionStorage.getItem('authToken');
  if (!token) {
    alert('Unauthorized: Please log in first.');
    window.location.href = '/index.html';
    return;
  }
  try {
    const response = await fetch('/admin/apikeys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ event: eventName })
    });
    if (response.ok) {
      const newKey = await response.json();
      alert('API Key generated: ' + newKey.apiKey);
      fetchApiKeys(); // Refresh the table
    } else {
      const errorData = await response.json();
      alert('Error generating API key: ' + errorData.error);
    }
  } catch (error) {
    console.error('Error generating API key:', error);
  }
}




/*DEVICES PAGE*/
/**
 * Fetch device assignments from the backend.
 */
async function fetchDevices() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }
    try {
        const response = await fetch('/admin/devices', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        if (response.ok) {
            const devicesData = await response.json();
            populateDevicesTable(devicesData);
            populateEventFilter(devicesData);
        } else {
            console.error('Failed to fetch devices:', response.statusText);
        }
    } catch (error) {
        console.error('Error fetching devices:', error);
    }
}

/**
 * Modified populateDevicesTable to include a checkbox for each row.
 * @param {Object} devicesData - Mapping of device IDs to event names.
 */

function populateDevicesTable(devicesData) {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    Object.entries(devicesData).forEach(([deviceId, event]) => {
        const tr = document.createElement('tr');

        // Checkbox cell for bulk selection (new dedicated column)
        const tdCheckbox = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('device-checkbox');
        checkbox.value = deviceId;
        tdCheckbox.appendChild(checkbox);
        tr.appendChild(tdCheckbox);

        // Device ID cell
        const tdId = document.createElement('td');
        tdId.textContent = deviceId;
        tr.appendChild(tdId);

        // Assigned Event cell
        const tdEvent = document.createElement('td');
        tdEvent.textContent = event;
        tr.appendChild(tdEvent);

        // Action cell with individual "Assign" button
        const tdAction = document.createElement('td');
        const assignButton = document.createElement('button');
        assignButton.textContent = 'Assign';
        assignButton.onclick = () => assignDevice(deviceId);
        tdAction.appendChild(assignButton);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
}











/**
 * Populate the event filter dropdown with unique event values.
 * @param {Object} devicesData - Mapping of device IDs to event names.
 */
function populateEventFilter(devicesData) {
    const filterSelect = document.getElementById('eventFilter');
    filterSelect.innerHTML = '<option value="">All Events</option>';
    const events = new Set(Object.values(devicesData));
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        filterSelect.appendChild(option);
    });
}

/**
 * Filter the devices table based on the selected event.
 */
function filterDevicesByEvent() {
    const filterValue = document.getElementById('eventFilter').value;
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    Array.from(tbody.rows).forEach(row => {
        // The "Assigned Event" is now in the 3rd cell (index 2) because the first cell is for checkboxes.
        const eventCell = row.cells[2].textContent.trim();
        row.style.display = (!filterValue || eventCell === filterValue) ? '' : 'none';
    });
}

/**
 * Sort the devices table by a given column index.
 * (Implementation is similar to your existing table sorting functions.)
 */
let devicesSortDirection = {};
function sortDevicesTable(columnIndex) {
    const table = document.querySelector('.device-table');
    const tbody = document.getElementById('deviceTableBody');
    const rows = Array.from(tbody.getElementsByTagName('tr'));

    devicesSortDirection[columnIndex] = !devicesSortDirection[columnIndex];

    rows.sort((rowA, rowB) => {
        let cellA = rowA.cells[columnIndex].textContent.trim();
        let cellB = rowB.cells[columnIndex].textContent.trim();
        // Numeric sort if applicable, else string sort
        if (!isNaN(cellA) && !isNaN(cellB)) {
            cellA = parseFloat(cellA);
            cellB = parseFloat(cellB);
        }
        return devicesSortDirection[columnIndex]
            ? (cellA > cellB ? 1 : -1)
            : (cellA < cellB ? 1 : -1);
    });
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
}

/**
 * Assign a new event to a device.
 * Uses the existing event filter dropdown options and adds a "Create new event" option.
 * If the user selects "Create new event," an input box appears to enter the new event name.
 * Sends a PUT request to update the device assignment.
 * @param {string} deviceId - The ID of the device to assign.
 */
async function assignDevice(deviceId) {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }

    // Get available events from the filter dropdown, if it exists
    const filterSelect = document.getElementById('eventFilter');
    let availableEvents = [];
    if (filterSelect) {
        // Get options except the first placeholder ("All Events")
        availableEvents = Array.from(filterSelect.options)
            .filter(opt => opt.value && opt.value !== "")
            .map(opt => opt.value);
    }

    // Create a select element with available events and an extra option to create a new event.
    const select = document.createElement('select');
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "-- Select an event --";
    select.appendChild(defaultOption);

    availableEvents.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });

    const createNewOption = document.createElement('option');
    createNewOption.value = "__create_new__";
    createNewOption.textContent = "Create new event...";
    select.appendChild(createNewOption);

    // Create an input element for new event, hidden by default.
    const inputNewEvent = document.createElement('input');
    inputNewEvent.type = 'text';
    inputNewEvent.placeholder = 'Enter new event name';
    inputNewEvent.style.display = 'none';
    inputNewEvent.style.marginTop = '10px';

    // Show/hide input based on the select value.
    select.addEventListener('change', () => {
        if (select.value === '__create_new__') {
            inputNewEvent.style.display = 'block';
        } else {
            inputNewEvent.style.display = 'none';
        }
    });

    // Create a simple modal overlay to present the select and input.
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = '#fff';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.textAlign = 'center';
    modal.innerHTML = `<p>Assign device ${deviceId} to an event:</p>`;
    modal.appendChild(select);
    modal.appendChild(inputNewEvent);

    // Confirm button to trigger the assignment.
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Assign';
    confirmBtn.style.marginTop = '10px';
    modal.appendChild(confirmBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    confirmBtn.onclick = async () => {
        let selectedEvent = select.value;
        if (!selectedEvent) {
            alert("Please select an event or choose to create a new one.");
            return;
        }
        if (selectedEvent === '__create_new__') {
            selectedEvent = inputNewEvent.value.trim();
            if (!selectedEvent) {
                alert("Please enter a new event name.");
                return;
            }
        }
        try {
            const response = await fetch(`/admin/devices/${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ event: selectedEvent })
            });
            if (response.ok) {
                alert("Device updated successfully.");
                fetchDevices(); // Refresh the device table
            } else {
                const errorData = await response.json();
                alert("Error updating device: " + errorData.error);
            }
        } catch (error) {
            console.error("Error updating device:", error);
        }
        document.body.removeChild(overlay);
    };
}




/**
 * Bulk assign devices:
 * Gathers selected device IDs and opens a modal with a dropdown list of events (from the event filter)
 * plus an option to create a new event. Once confirmed, sends a bulk update via POST /admin/devices/bulk.
 */
async function bulkAssignDevices() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Unauthorized: Please log in first.');
        window.location.href = '/index.html';
        return;
    }

    // Gather selected devices from checkboxes
    const checkboxes = document.querySelectorAll('.device-checkbox:checked');
    if (!checkboxes.length) {
        alert('No devices selected.');
        return;
    }
    const selectedDevices = Array.from(checkboxes).map(cb => cb.value);

    // Build the modal UI for bulk assignment
    const select = document.createElement('select');
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "-- Select an event --";
    select.appendChild(defaultOption);

    // Use events from the existing event filter dropdown, if available
    const filterSelect = document.getElementById('eventFilter');
    let availableEvents = [];
    if (filterSelect) {
        availableEvents = Array.from(filterSelect.options)
            .filter(opt => opt.value && opt.value !== "")
            .map(opt => opt.value);
    }
    availableEvents.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });
    // Option to create a new event
    const createNewOption = document.createElement('option');
    createNewOption.value = "__create_new__";
    createNewOption.textContent = "Create new event...";
    select.appendChild(createNewOption);

    // Input for new event (hidden by default)
    const inputNewEvent = document.createElement('input');
    inputNewEvent.type = 'text';
    inputNewEvent.placeholder = 'Enter new event name';
    inputNewEvent.style.display = 'none';
    inputNewEvent.style.marginTop = '10px';
    select.addEventListener('change', () => {
        if (select.value === '__create_new__') {
            inputNewEvent.style.display = 'block';
        } else {
            inputNewEvent.style.display = 'none';
        }
    });

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = '#fff';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.textAlign = 'center';
    modal.innerHTML = `<p>Assign selected devices to an event:</p>`;
    modal.appendChild(select);
    modal.appendChild(inputNewEvent);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Assign';
    confirmBtn.style.marginTop = '10px';
    modal.appendChild(confirmBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // On confirmation, determine the event and send bulk update
    confirmBtn.onclick = async () => {
        let selectedEvent = select.value;
        if (!selectedEvent) {
            alert("Please select an event or choose to create a new one.");
            return;
        }
        if (selectedEvent === '__create_new__') {
            selectedEvent = inputNewEvent.value.trim();
            if (!selectedEvent) {
                alert("Please enter a new event name.");
                return;
            }
        }
        // Build a mapping of device IDs to the chosen event
        const bulkMapping = {};
        selectedDevices.forEach(deviceId => {
            bulkMapping[deviceId] = selectedEvent;
        });
        try {
            const response = await fetch('/admin/devices/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(bulkMapping)
            });
            if (response.ok) {
                alert("Devices updated successfully.");
                fetchDevices(); // Refresh the device table
            } else {
                const errorData = await response.json();
                alert("Error updating devices: " + errorData.error);
            }
        } catch (error) {
            console.error("Error updating devices:", error);
        }
        document.body.removeChild(overlay);
    };
}




// ------------------------
// DOMContentLoaded: Run device functions if on devices page
// ------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Check if the device table exists (we're on devices page)
    if (document.getElementById('deviceTableBody')) {
        fetchDevices();

        // Append Bulk Assign button if not already present
        let bulkBtn = document.getElementById('bulkAssignBtn');
        if (!bulkBtn) {
            bulkBtn = document.createElement('button');
            bulkBtn.id = 'bulkAssignBtn';
            bulkBtn.textContent = 'Bulk Assign';
            bulkBtn.onclick = bulkAssignDevices;
            // Insert the bulk button at the top of the device management section
            const container = document.querySelector('.device-management');
            container.insertBefore(bulkBtn, container.firstChild);
        }
                // Setup the "Select All" checkbox functionality
        const selectAll = document.getElementById('selectAllDevices');
        if (selectAll) {
            selectAll.addEventListener('change', function () {
                const checkboxes = document.querySelectorAll('.device-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = selectAll.checked;
                });
            });
        }

    }
});
