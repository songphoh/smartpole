require('dotenv').config();

/**
 * Determines the base URL for the application.
 * In production, it uses APP_BASE_URL from environment variables.
 * In development, it defaults to http://localhost:PORT.
 * @returns {string} The base URL of the application.
 */
const getAppBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.APP_BASE_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app.onrender.com'}`;
  } else {
    const port = process.env.PORT || 3000;
    return process.env.APP_BASE_URL || `http://localhost:${port}`;
  }
};

const appBaseUrl = getAppBaseUrl();

module.exports = {
  // LINE Bot Configuration
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  
  // Google Sheets Configuration
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  GOOGLE_DRIVE_SIGNATURE_FOLDER_ID: process.env.GOOGLE_DRIVE_SIGNATURE_FOLDER_ID,
  
  // Sheet Names
  LINE_USER_PROFILE_SHEET_NAME: "LineID", 
  REPAIR_REQUESTS_SHEET_NAME: "แจ้งเหตุไฟฟ้าขัดข้อง", 
  POLE_DATA_SHEET_NAME: "ข้อมูลเสาไฟฟ้า", 
  INVENTORY_SHEET_NAME: "คลังอุปกรณ์",
  ADMIN_USERS_SHEET_NAME: "AdminUsers", // New: Sheet name for admin dashboard users
  TELEGRAM_CONFIG_SHEET_NAME: process.env.TELEGRAM_CONFIG_SHEET_NAME || 'TelegramConfig',
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  BASE_URL: appBaseUrl, 
  
  // Contact Information
  CONTACT_INFO: {
    OFFICE_NAME: "อบต.ข่าใหญ่", 
    PHONE: "042-315962",       
    EMAIL: "contact@khayai.go.th" 
  },
  
  // States for conversation flow
STATES: {
  NONE: null, 
  AWAITING_FORM_COMPLETION: 'AWAITING_FORM_COMPLETION', 
  AWAITING_USER_DATA_CONFIRMATION: 'AWAITING_USER_DATA_CONFIRMATION', 
  AWAITING_POLE_ID: 'AWAITING_POLE_ID', 
  AWAITING_REASON: 'AWAITING_REASON',   
  AWAITING_PHOTO_CHOICE: 'AWAITING_PHOTO_CHOICE', 
  AWAITING_PHOTO_UPLOAD: 'AWAITING_PHOTO_UPLOAD', 
  AWAITING_FINAL_CONFIRMATION: 'AWAITING_FINAL_CONFIRMATION', 
  
  // ✅ เพิ่ม states ใหม่สำหรับการติดตาม (ตรงกับ server.js)
  AWAITING_TRACKING_METHOD: 'AWAITING_TRACKING_METHOD',
  AWAITING_REQUEST_ID: 'AWAITING_REQUEST_ID',
  AWAITING_PHONE_NUMBER: 'AWAITING_PHONE_NUMBER',
  
  // เก็บไว้เผื่อใช้ในอนาคต
  AWAITING_TRACKING_CHOICE: 'AWAITING_TRACKING_CHOICE', 
  AWAITING_TRACKING_REQUEST_ID_INPUT: 'AWAITING_TRACKING_REQUEST_ID_INPUT', 
  AWAITING_TRACKING_PHONE_INPUT: 'AWAITING_TRACKING_PHONE_INPUT' 
},

  TIMEZONE: process.env.TZ || "Asia/Bangkok"
};
