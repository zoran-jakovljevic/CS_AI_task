const csvFile = document.getElementById("csvFile");
const submitButton = document.getElementById("submitButton");
const tableContainer = document.getElementById("tableContainer");

function calculatePriority(customer) {

    const today = new Date();

    const renewalDate = customer["Renewal Date"];
    const lastTouchDate = customer["Last CSM Touch Date"];
    const daysUntilRenewal = (renewalDate - today) / 86400000;
    const daysSinceTouch = (today - lastTouchDate) / 86400000;

    const renewalScore = Math.max(0, 1 - daysUntilRenewal / 365);
    const healthScore = 1 - Number(customer["Health Score"]) / 100;
    const ticketScore = Math.min(1, Number(customer["Open Support Tickets"]) / 10);
    const touchScore = Math.min(1, daysSinceTouch / 90);
    const adoptionScore = 1 - Number(customer["Product Adoption %"]) / 100;

    return (renewalScore * 0.4 + healthScore * 0.2 + ticketScore * 0.15 + touchScore * 0.15 + adoptionScore * 0.1);
}


function excelDateToJsDate(excelDate) {
    return new Date((excelDate - 25569) * 86400 * 1000);
}

function parseCsv(csv) {

    const rows = csv.trim().split("\n");

    const headers = rows[0].split(",").map(header => header.trim());

    const customers = [];

    rows.slice(1).forEach(row => {

        if (row.replace(/,/g, "").trim() === "") return;

        let fields = [];
        let currentField = "";
        let insideQuotes = false;

        for (let char of row) {

            if (char === '"') {
                insideQuotes = !insideQuotes;
            }
            else if (char === "," && !insideQuotes) {
                fields.push(currentField.trim());
                currentField = "";
            }
            else {
                currentField += char;
            }
        }

        fields.push(currentField.trim());

        const customer = {};

        headers.forEach((header, index) => {

            let value = fields[index];

            if (header.toLowerCase().includes("date")) {
                value = excelDateToJsDate(Number(value));
            }

            customer[header] = value;
        });

        customers.push(customer);
    });

    return {
        headers,
        customers
    };
}

function renderSummaryButton(customers) {

    const summaryButton = document.createElement("button");
    summaryButton.textContent = "Generate AI Summary";
    summaryButton.id = "summaryButton";

    const summaryDiv = document.createElement("div");
    summaryDiv.id = "summaryDiv";

    summaryButton.addEventListener("click", async () => {

        summaryButton.textContent = "Loading...";
        summaryButton.disabled = true;

        const top3 = customers.slice(0, 3);

        const customerInfo = top3.map(c => `
            - ${c["Customer Name"]}: Health Score ${c["Health Score"]}, 
            ${c["Open Support Tickets"]} open tickets, 
            ${c["Product Adoption %"]}% adoption, 
            renewal ${c["Renewal Date"].toLocaleDateString()}, CSM Notes ${c["CSM Notes"]}
        `).join("\n");

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-6",
                max_tokens: 300,
                messages: [{
                    role: "user",
                    content: `You are a Customer Success Manager assistant. Based on these top 3 at-risk accounts, write a response that starts with "The three clients most at risk are the following:" and then list three bullet points, one for each client. Bold each client's name and next to it explain why they are at risk this week:\n${customerInfo}`
                }]
            })
        });

        const data = await response.json();
        const rawText = data.content[0].text;

        const formattedText = rawText
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/•/g, "<br><br>•");

        summaryDiv.innerHTML = formattedText;
        summaryDiv.classList.add("visible");

        summaryButton.textContent = "Generate AI Summary";
        summaryButton.disabled = false;
    });

    tableContainer.appendChild(summaryButton);
    tableContainer.appendChild(summaryDiv);
}

function renderTable(customers, headers) {

    let tableHtml = `
        <table border="1">
            <thead>
                <tr>`;

    headers.forEach(header => {
        tableHtml += `<th>${header}</th>`;
    });

    tableHtml += `
                </tr>
            </thead>
            <tbody>`;

    customers.forEach(customer => {

        tableHtml += `<tr>`;

        headers.forEach(header => {
            tableHtml += `<td>${customer[header]}</td>`;
        });

    });

    tableHtml += `
            </tbody>
        </table>`;

    tableContainer.innerHTML = tableHtml;

    renderSummaryButton(customers);

}

submitButton.addEventListener("click", () => {

    const file = csvFile.files[0];

    if (!file) {
        alert("Please select a file!");
        return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {

        const csv = event.target.result;

        const { headers, customers } = parseCsv(csv);

        customers.forEach(customer => {
            customer.priorityScore = calculatePriority(customer);
        });

        customers.sort(
            (a, b) => b.priorityScore - a.priorityScore
        );

        renderTable(customers, headers);
    };

    reader.readAsText(file);
});