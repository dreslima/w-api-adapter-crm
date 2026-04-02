const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3002;

// Configuration
const W_API_TOKEN = process.env.W_API_TOKEN || '';
const W_API_INSTANCE_ID = process.env.W_API_INSTANCE_ID || '';
const CRM_AGENT_URL = process.env.CRM_AGENT_URL || 'http://crm-agent:3200';
const CRM_AGENT_SECRET = process.env.CRM_AGENT_SECRET || '';

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'w-api-adapter-crm' });
});

// Extract message from W-API payload
function extractMessageText(wapiPayload) {
  if (wapiPayload.msgContent?.extendedTextMessage?.text) {
    return wapiPayload.msgContent.extendedTextMessage.text;
  } else if (wapiPayload.msgContent?.conversation) {
    return wapiPayload.msgContent.conversation;
  } else if (wapiPayload.msgContent?.imageMessage?.caption) {
    return wapiPayload.msgContent.imageMessage.caption;
  } else if (wapiPayload.msgContent?.imageMessage) {
    return '[Image]';
  } else if (wapiPayload.msgContent?.videoMessage) {
    return '[Video]';
  } else if (wapiPayload.msgContent?.audioMessage) {
    return '[Audio]';
  } else if (wapiPayload.msgContent?.documentMessage) {
    return '[Document]';
  }
  return '[Media]';
}

// Format phone
function formatPhone(phone) {
  if (!phone) return '';
  if (!phone.startsWith('+')) {
    return '+' + phone;
  }
  return phone;
}

// Get W-API headers
function getWapiHeaders() {
  return {
    'Authorization': `Bearer ${W_API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// Send message via W-API
async function sendMessageViaWapi(phone, content) {
  try {
    console.log(`Sending message via W-API to ${phone}: ${content}`);

    const response = await axios.post(
      `https://api.w-api.app/v1/message/send-text?instanceId=${W_API_INSTANCE_ID}`,
      {
        phone: phone.replace('+', ''),
        message: content
      },
      { headers: getWapiHeaders() }
    );

    console.log('Message sent via W-API:', response.data);
    return response.data;

  } catch (error) {
    console.error('Error sending via W-API:', error.response?.data || error.message);
    throw error;
  }
}

// Forward to CRM Agent
async function forwardToCrmAgent(message, phone, pushName, messageId) {
  try {
    console.log(`Forwarding to CRM Agent: ${message}`);

    const response = await axios.post(
      `${CRM_AGENT_URL}/webhook`,
      {
        message,
        sender: {
          id: phone,
          pushName: pushName || 'WhatsApp User'
        },
        messageId: messageId || `msg_${Date.now()}`,
        timestamp: Date.now()
      },
      {
        headers: {
          'x-agent-secret': CRM_AGENT_SECRET,
          'Content-Type': 'application/json'
        },
        timeout: 90000 // 90s for LLM processing
      }
    );

    console.log('CRM Agent response:', response.data);
    return response.data;

  } catch (error) {
    console.error('Error forwarding to CRM Agent:', error.response?.data || error.message);
    throw error;
  }
}

// Webhook from W-API
app.post('/webhook', async (req, res) => {
  try {
    const wapiPayload = req.body;

    console.log('Received W-API webhook:', JSON.stringify(wapiPayload, null, 2));

    // Ignore messages sent by us
    if (wapiPayload.fromMe === true) {
      console.log('Ignoring message sent by us');
      return res.status(200).json({ status: 'ignored', reason: 'from_me' });
    }

    const phone = formatPhone(wapiPayload.sender?.id);
    const name = wapiPayload.sender?.pushName || 'WhatsApp User';
    const content = extractMessageText(wapiPayload);
    const messageId = wapiPayload.key?.id || `msg_${Date.now()}`;

    console.log(`Processing message from ${phone} (${name}): ${content}`);

    // Forward to CRM Agent
    const crmResponse = await forwardToCrmAgent(content, phone, name, messageId);

    // Send CRM response back to user via W-API
    if (crmResponse?.response) {
      await sendMessageViaWapi(phone, crmResponse.response);
    }

    console.log('Message processed successfully!');
    res.status(200).json({ status: 'ok', processed: true });

  } catch (error) {
    console.error('Error processing webhook:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`W-API Adapter CRM running on port ${PORT}`);
  console.log(`W-API Instance: ${W_API_INSTANCE_ID}`);
  console.log(`CRM Agent URL: ${CRM_AGENT_URL}`);
});
