// LOGIN HANDLER
document.getElementById("loginButton").addEventListener("click", async () => {
    const email = document.getElementById("emailInput").value;
    const password = document.getElementById("passwordInput").value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        alert("Login failed: " + error.message);
        return;
    }

    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("dashboardContainer").style.display = "block";

    loadSubdivisions();
});

// LOAD SUBDIVISIONS
async function loadSubdivisions() {
    const { data, error } = await supabase
        .from("Subdivisions")
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        console.error("Error loading subdivisions:", error);
        return;
    }

    const dropdown = document.getElementById("subdivisionSelect");
    dropdown.innerHTML = "";

    data.forEach((sub) => {
        const option = document.createElement("option");
        option.value = sub.id;
        option.textContent = sub.name;
        dropdown.appendChild(option);
    });

    if (data.length > 0) {
        dropdown.value = data[0].id;
        loadData(data[0].id);
    }
}

// LOAD CROSSINGS
async function loadData(subdivisionId) {
    const { data, error } = await supabase
        .from("Crossings")
        .select("*")
        .eq("subdivision_id", subdivisionId)
        .order("milepost", { ascending: true });

    if (error) {
        console.error("Error loading crossings:", error);
        return;
    }

    renderTable(data);
}

// RENDER TABLE
function renderTable(crossings) {
    const tableBody = document.getElementById("crossingsTableBody");
    tableBody.innerHTML = "";

    crossings.forEach((row) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="dot-link" data-lat="${row.latitude}" data-lon="${row.longitude}">
                ${row.dot_number}
            </td>
            <td>${row.milepost ?? ""}</td>
            <td>${row.crossing_number ?? ""}</td>
            <td>${row.track_type ?? ""}</td>
            <td>${row.crossing_type ?? ""}</td>
            <td>${row.completed ? "Yes" : "No"}</td>
            <td>${row.asphalted ? "Yes" : "No"}</td>
            <td>${row.planned_footage ?? ""}</td>
            <td>${row.actual_footage ?? ""}</td>
            <td>${row.completed_by ?? ""}</td>
            <td>${row.date_completed ?? ""}</td>
            <td>${row.helped ?? ""}</td>
        `;

        tableBody.appendChild(tr);
    });

    attachDotClickHandlers();
}

// CLICK HANDLER FOR GOOGLE MAPS
function attachDotClickHandlers() {
    document.querySelectorAll(".dot-link").forEach((cell) => {
        cell.style.cursor = "pointer";
        cell.style.color = "#0077cc";
        cell.style.textDecoration = "underline";

        cell.addEventListener("click", () => {
            const lat = cell.getAttribute("data-lat");
            const lon = cell.getAttribute("data-lon");

            if (!lat || !lon) {
                alert("No coordinates available for this crossing.");
                return;
            }

            const url = `https://www.google.com/maps?q=${lat},${lon}`;
            window.open(url, "_blank");
        });
    });
}

// SUBDIVISION CHANGE LISTENER
document.getElementById("subdivisionSelect").addEventListener("change", (e) => {
    loadData(e.target.value);
});
