/*
Paypal keys
Note: 
- The keys are typically not stored here but in an .env file
- Replace the keys below with your own keys from paypal
*/
const PAYPAL_CLIENT_ID = "AaVwZE8pzz1L1kh5QA1HfiNQbB7Bn2dj98yjWnRoSYWfsayiwMf4_vcLcA7ZDaMSjWQRJKE3gWdWs3lT";
const PAYPAL_CLIENT_SECRET = "EKs-m5dMKsyO3YTyG71vuJeT9mJ_rRut3mRJEcVko-DdYlr0bZ8oCNLGpRQ0z-CKHutRxBBuCv8nG8g6";
const BASE = "https://api-m.sandbox.paypal.com";

// export default async function generateAccessToken() {
async function generateAccessToken() {
    // To base64 encode your client id and secret
    const BASE64_ENCODED_CLIENT_ID_AND_SECRET = Buffer.from(
        `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const request = await fetch(
        "https://api-m.sandbox.paypal.com/v1/oauth2/token",
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${BASE64_ENCODED_CLIENT_ID_AND_SECRET}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials"
        }
    );
    const json = await request.json();
    return json.access_token;
}

async function handleResponse(response) {
    try {
        const jsonResponse = await response.json();
        return {
            jsonResponse,
            httpStatusCode: response.status,
        };
    } catch (err) {
        const errorMessage = await response.text();
        throw new Error(errorMessage);
    }
}

const createOrder = async (tickets) => {
    const processed_tickets = tickets.map(ticket => ({
        name: ticket.eventName,
        unit_amount: {
            currency_code: "SGD",
            value: Number(ticket.ticketPrice).toFixed(2),
        },
        quantity: ticket.cartTicketQuantity.toString(),
    }));

    let total_amount = tickets.reduce((acc, ticket) => acc + (ticket.ticketPrice * ticket.cartTicketQuantity), 0).toFixed(2);

    const accessToken = await generateAccessToken();
    const url = `${BASE}/v2/checkout/orders`;

    const payload = {
        intent: "CAPTURE",
        purchase_units: [{
            items: processed_tickets,
            amount: {
                currency_code: "SGD",
                value: total_amount,
                breakdown: {
                    item_total: {
                        currency_code: "SGD",
                        value: total_amount,
                    },
                },
            },
        }],
    };

    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        method: "POST",
        body: JSON.stringify(payload),
    });

    return handleResponse(response);
};

const captureOrder = async (orderID) => {
    const accessToken = await generateAccessToken();
    const url = `${BASE}/v2/checkout/orders/${orderID}/capture`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
    });

    return handleResponse(response);
};

exports.createOrderHandler = async (req, res) => {
    try {
        const { tickets } = req.body;
        const { jsonResponse, httpStatusCode } = await createOrder(tickets);
        res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
        console.error("Failed to create order:", error);
        res.status(500).json({ error: "Failed to create order." });
    }
};

exports.captureOrderHandler = async (req, res) => {
    try {
        const { orderID } = req.params;
        const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
        res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
        console.error("Failed to capture order:", error);
        res.status(500).json({ error: "Failed to capture order." });
    }
};
