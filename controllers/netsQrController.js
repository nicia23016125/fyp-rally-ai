const axios = require("axios");

// Controller to generate a QR code
exports.generateQrCode = async (req, res) => {
    const { cartTotal } = req.body;
    console.log(cartTotal)
    try {
        const requestBody = {
            txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b", // Default for testing
            amt_in_dollars: cartTotal,
            notify_mobile: 0,
        };

        const response = await axios.post(
            `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
            requestBody,
            {
                headers: {
                    "api-key": process.env.API_KEY,
                    "project-id": process.env.PROJECT_ID,
                },
            }
        );

        const qrData = response.data.result.data;
        console.log({qrData})

        if (qrData.response_code === "00" && qrData.txn_status === 1 &&
            qrData.qr_code) {
            console.log("QR code generated successfully");

            // Store transaction retrieval reference for later use
            const txnRetrievalRef = qrData.txn_retrieval_ref;
            const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook`;

            console.log("Transaction retrieval ref:"+txnRetrievalRef)

            // Render the QR code page with required data
            res.render("netsQr", {
                total: cartTotal,
                title: "Scan to Pay",
                qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
                txnRetrievalRef: txnRetrievalRef,
                networkCode: qrData.network_status,
                timer: 300, // Timer in seconds
                webhookUrl: webhookUrl,
                apiKey: process.env.API_KEY,
                projectId: process.env.PROJECT_ID,
            });
        } else {
            // Handle partial or failed responses
            res.render("netsQrFail", {
                title: "Error",
                responseCode: qrData.response_code || "N.A.",
                instructions: qrData.network_status === 0 ? qrData.instruction : "",
                errorMsg: qrData.network_status !== 0 ? "Frontend Error Message" : "",
            });
        }
    } catch (error) {
        console.error("Error in generateQrCode:", error.message);
        // Redirect to fail page on API call failure
        res.redirect("/nets-qr/fail");
    }
};
