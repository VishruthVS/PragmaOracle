const TelegramBot = require("node-telegram-bot-api");
const WebSocket = require("ws");

const token = "";
const bot = new TelegramBot(token, { polling: true });

const PRAGMA_API_BASE_URL = "wss://ws.dev.pragma.build";
const URI = "node/v1/data/subscribe";
const WS_URL = `${PRAGMA_API_BASE_URL}/${URI}`;

const assetMappingWithRisk = [
  { id: "455552555344", ticker: "EUR/USD", risk: "M" },
  { id: "425443555344", ticker: "BTC/USD", risk: "L" },
  { id: "455448555344", ticker: "ETH/USD", risk: "L" },
  { id: "534F4C555344", ticker: "SOL/USD", risk: "L" },
  { id: "4D41544943555344", ticker: "MATIC/USD", risk: "M" },
  { id: "544941555344", ticker: "TIA/USD", risk: "M" },
];

const SUBSCRIBE_MESSAGE = {
  msg_type: "subscribe",
  pairs: assetMappingWithRisk.map((asset) => asset.ticker),
};

let latestValues = {};

function connectWebSocket() {
  const ws = new WebSocket(WS_URL, {
    rejectUnauthorized: false,
  });

  ws.on("open", () => {
    console.log("Connected to WebSocket");
    console.log("Subscription Message:", SUBSCRIBE_MESSAGE);
    ws.send(JSON.stringify(SUBSCRIBE_MESSAGE));
    console.log("Subscription message sent:", SUBSCRIBE_MESSAGE);
  });

  ws.on("message", (data) => {
    console.log("Raw WebSocket Data:", data);
    try {
      const message = JSON.parse(data);
      console.log("Parsed Message:", message);
      message.oracle_prices?.forEach((oracleData) => {
        const normalizedId = oracleData.global_asset_id.replace(/^0x/, "");
        console.log("Normalized ID:", normalizedId);

        const matchedAsset = assetMappingWithRisk.find(
          (asset) => asset.id.toLowerCase() === normalizedId.toLowerCase()
        );

        if (matchedAsset) {
          console.log(`Matched Asset for ID ${normalizedId}:`, matchedAsset);
          latestValues[matchedAsset.ticker] = {
            median_price: oracleData.median_price,
            risk: matchedAsset.risk,
            timestamp: message.timestamp,
          };
        } else {
          console.log(`No match found for ID ${normalizedId}`);
          latestValues[oracleData.global_asset_id] = {
            median_price: oracleData.median_price,
            timestamp: message.timestamp,
          };
        }
        console.log("Updated Latest Values:", latestValues);
      });
    } catch (err) {
      console.error("Error processing WebSocket message:", err);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed, reconnecting...");
    setTimeout(connectWebSocket, 5000);
  });
}

connectWebSocket();

function formatLatestValues() {
  let formattedData = "";
  Object.entries(latestValues).forEach(([ticker, data]) => {
    formattedData += `${ticker} - Median Price: ${data.median_price || "N/A"} - Risk: ${
      data.risk || "N/A"
    }\n`;
  });
  return formattedData || "No data available yet.";
}

const activeMessages = new Map();

function updateMessages() {
  const formattedData = formatLatestValues();
  activeMessages.forEach((chatId, messageId) => {
    bot
      .editMessageText(formattedData, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "Refresh", callback_data: "refresh" }]],
        },
      })
      .catch((err) => {
        console.error("Error updating message:", err);
      });
  });
}

setInterval(updateMessages, 2000);

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText === "/start") {
    bot.sendMessage(chatId, "Welcome to the bot! Use /price to get the latest price updates.");
  } else if (messageText === "/price") {
    bot
      .sendMessage(chatId, formatLatestValues(), {
        reply_markup: {
          inline_keyboard: [[{ text: "Refresh", callback_data: "refresh" }]],
        },
      })
      .then((sentMessage) => {
        activeMessages.set(sentMessage.message_id, chatId);
      });
  } else {
    bot.sendMessage(chatId, "Unknown command. Use /start or /price.");
  }
});

bot.on("callback_query", (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (callbackQuery.data === "refresh") {
    const formattedData = formatLatestValues();
    bot.editMessageText(formattedData, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: "Refresh", callback_data: "refresh" }]],
      },
    });
  }
});
