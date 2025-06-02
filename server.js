// server.js (เวอร์ชันปรับปรุง - เพิ่มระบบติดตามสมบูรณ์ + UI สวยงาม)
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const config = require('./config/config');
const googleSheetsService = require('./services/googleSheets');
const lineService = require('./services/lineService');
const { google } = require('googleapis');
const stream = require('stream');
let pdfService = null;
try {
    pdfService = require('./services/pdfService');
    console.log('✅ PDF Service loaded successfully');
} catch (error) {
    console.warn('⚠️ PDF Service not available:', error.message);
    console.log('📄 PDF features will be disabled, but the system will continue to work normally');
    
    // สร้าง mock PDF service
    pdfService = {
        healthCheck: async () => ({ status: 'unavailable', message: 'PDF service disabled - puppeteer not installed' }),
        closeBrowser: async () => { console.log('PDF service not available, nothing to close'); },
        createRepairRequestsReport: async () => ({ 
            success: false, 
            error: 'PDF service ไม่พร้อมใช้งาน - กรุณาติดต่อผู้ดูแลระบบเพื่อติดตั้ง puppeteer' 
        }),
        createSingleRequestDocument: async () => ({ 
            success: false, 
            error: 'PDF service ไม่พร้อมใช้งาน - กรุณาติดต่อผู้ดูแลระบบเพื่อติดตั้ง puppeteer' 
        })
    };
}

const app = express();

// Middleware Setup
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin_dashboard')));

app.use('/mobile', express.static(path.join(__dirname, 'mobile', 'build')));
app.get('/mobile/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile', 'build', 'index.html'), (err) => {
    if (err) {
      console.error("Error sending React app's index.html:", err);
      res.status(500).send("Error loading the application.");
    }
  });
});

// Admin Authentication
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-jwt-secret-key-please-change-this';

function authenticateAdminToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        if (req.path.includes('/admin/') && req.method === 'GET' && !req.path.startsWith('/api/admin/')) {
            return next();
        }
        if (req.path.startsWith('/api/admin/')) {
            console.warn(`🚫 API Access Denied: No token provided for ${req.method} ${req.path}.`);
            return res.status(401).json({ status: 'error', message: 'Token not provided. Please login.' });
        }
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err.message);
            if (req.path.includes('/admin/') && req.method === 'GET' && !req.path.startsWith('/api/admin/')) {
                return res.redirect('/admin/login?session=expired');
            }
            return res.status(403).json({ status: 'error', message: 'Token is not valid or expired. Please login again.' });
        }
        req.user = user;
        next();
    });
}

// helper สำหรับ escape Markdown
function escapeMarkdown(text) {
    if (!text || typeof text !== 'string') return 'ไม่ระบุ';
    // Escape special characters for Telegram Markdown
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ✅ ปรับปรุงฟังก์ชัน sendTelegramNotification
async function sendTelegramNotification(message, includeLoginLink = false) {
    try {
        const telegramConfig = await googleSheetsService.getTelegramConfig();
        
        if (!telegramConfig || !telegramConfig.isEnabled) {
            console.log('📱 Telegram notifications are disabled.');
            return { success: false, reason: 'disabled' };
        }

        if (!telegramConfig.botToken || !telegramConfig.chatId) {
            console.warn('⚠️ Telegram notifications are enabled, but Bot Token or Chat ID is missing.');
            return { success: false, reason: 'missing_config' };
        }

        let finalMessage = message;
        if (includeLoginLink) {
            const loginUrl = `${config.BASE_URL}/admin/smart-login.html`;
            finalMessage += `\n\n🔗 [เข้าสู่ระบบจัดการ](${loginUrl})`;
        }

        // ✅ ตรวจสอบความยาวข้อความ (Telegram limit ~4096 characters)
        if (finalMessage.length > 4000) {
            finalMessage = finalMessage.substring(0, 3900) + '\n\n... (ข้อความถูกตัดทอนเนื่องจากยาวเกินไป)';
        }

        console.log('📤 Sending Telegram message:', finalMessage.substring(0, 200) + '...');

        const telegramApiUrl = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
        
        const response = await axios.post(telegramApiUrl, {
            chat_id: telegramConfig.chatId,
            text: finalMessage,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.ok) {
            console.log(`✅ Telegram notification sent successfully`);
            return { success: true, messageId: response.data.result.message_id };
        } else {
            console.error('❌ Telegram API returned error:', JSON.stringify(response.data, null, 2));
            return { success: false, error: response.data };
        }
    } catch (error) {
        console.error('❌ Error sending Telegram notification:', error.message);
        if (error.response && error.response.data) {
            console.error('❌ Telegram API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.message };
    }
}

async function testTelegramNotification(botToken, chatId) {
    try {
        const testMessage = `🔧 *ทดสอบการแจ้งเตือน Telegram*\n\nระบบแจ้งซ่อมไฟฟ้า อบต.ข่าใหญ่\n⏰ ${new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE })}`;
        
        const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        
        const response = await axios.post(telegramApiUrl, {
            chat_id: chatId,
            text: testMessage,
            parse_mode: 'Markdown'
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data && response.data.ok;
    } catch (error) {
        console.error('Test Telegram notification failed:', error.message);
        return false;
    }
}

// --- Utility Functions for LINE Bot state management ---
const userStates = new Map();
const userDataStore = new Map();

function setUserState(userId, state) {
  if (state) { userStates.set(userId, state); } else { userStates.delete(userId); }
}
function getUserState(userId) { return userStates.get(userId) || config.STATES.NONE; }
function setUserData(userId, data) {
  const currentData = userDataStore.get(userId) || {};
  const newData = { ...currentData, ...data };
  userDataStore.set(userId, newData);
}
function getUserData(userId) { return userDataStore.get(userId) || {}; }
function clearUserStateAndData(userId) {
  userStates.delete(userId); userDataStore.delete(userId);
}
function generateRequestId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
  return `REQ-${year}${month}${day}-${hours}${minutes}-${randomSuffix}`;
}

// --- Flex Message Templates with Professional Golden Theme ---
function createWelcomeFlexMessage() {
    return {
        type: "flex",
        altText: "ยินดีต้อนรับสู่ระบบแจ้งซ่อมไฟฟ้า อบต.ข่าใหญ่",
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "⚡ ระบบแจ้งซ่อมไฟฟ้า",
                        weight: "bold",
                        size: "xl",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    },
                    {
                        type: "text",
                        text: "องค์การบริหารส่วนตำบลข่าใหญ่",
                        size: "sm",
                        color: "#0D47A1", // เปลี่ยนจาก #FFF3E0 เป็น #0D47A1
                        align: "center",
                        margin: "sm"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #ffcc00 เป็น #FFC107
                paddingAll: "20px",
                spacing: "sm"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "ยินดีต้อนรับท่านครับ 🙏",
                        weight: "bold",
                        size: "lg",
                        color: "#E65100",
                        align: "center"
                    },
                    {
                        type: "text",
                        text: "กรุณาเลือกบริการที่ต้องการใช้งาน",
                        size: "sm",
                        color: "#424242",
                        align: "center",
                        margin: "md"
                    }
                ],
                spacing: "md",
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        height: "sm",
                        action: {
                            type: "message",
                            label: "🔧 แจ้งซ่อมไฟฟ้า",
                            text: "แจ้งซ่อม"
                        },
                        color: "#FFB300",
                        flex: 1
                    },
                    {
                        type: "button",
                        style: "secondary",
                        height: "sm",
                        action: {
                            type: "message",
                            label: "📊 ติดตามการซ่อม",
                            text: "ติดตามการซ่อม"
                        },
                        flex: 1
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createPersonalInfoFormFlexMessage(userId) {
    const formUrl = `${config.BASE_URL}/form?userId=${encodeURIComponent(userId)}`;
    
    return {
        type: "flex",
        altText: "กรอกข้อมูลส่วนตัว",
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📝 กรอกข้อมูลส่วนตัว",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #1976D2 เป็น #FFC107
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📋 ข้อมูลสำหรับการติดต่อ",
                        weight: "bold",
                        size: "md",
                        color: "#E65100"
                    },
                    {
                        type: "text",
                        text: "กรุณากรอกข้อมูลเพื่อให้เจ้าหน้าที่สามารถติดต่อกลับได้",
                        size: "sm",
                        color: "#616161",
                        wrap: true,
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "👤",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "คำนำหน้า ชื่อ นามสกุล",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📱",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "หมายเลขโทรศัพท์",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🏠",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "ที่อยู่ (บ้านเลขที่ หมู่ที่)",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            }
                        ]
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "uri",
                            label: "📝 เปิดฟอร์มกรอกข้อมูล",
                            uri: formUrl
                        },
                        color: "#ffcc00"
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createRepairFormFlexMessage(userId) {
    const formUrl = `${config.BASE_URL}/repair-form.html?userId=${encodeURIComponent(userId)}`;
    
    return {
        type: "flex",
        altText: "แบบฟอร์มแจ้งซ่อมไฟฟ้า",
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "🔧 แจ้งซ่อมไฟฟ้า",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #FFB300 เป็น #FFC107
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📋 กรอกแบบฟอร์มแจ้งซ่อม",
                        weight: "bold",
                        size: "md",
                        color: "#E65100"
                    },
                    {
                        type: "text",
                        text: "ระบุรายละเอียดปัญหาไฟฟ้าพร้อมตำแหน่งที่ตั้ง",
                        size: "sm",
                        color: "#616161",
                        wrap: true,
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🗼",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "รหัสเสาไฟฟ้า (หากทราบ)",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📍",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "ตำแหน่งที่ตั้ง/พิกัด GPS",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⚠️",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "ลักษณะปัญหา/อาการ",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📸",
                                        size: "sm",
                                        flex: 0,
                                        color: "#FFB300"
                                    },
                                    {
                                        type: "text",
                                        text: "รูปภาพประกอบ (ถ้ามี)",
                                        size: "xs",
                                        color: "#424242",
                                        flex: 1,
                                        margin: "sm"
                                    }
                                ]
                            }
                        ]
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "uri",
                            label: "📝 เปิดฟอร์มแจ้งซ่อม",
                            uri: formUrl
                        },
                        color: "#ffcc00"
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createPersonalInfoConfirmationFlexMessage(userData) {
    return {
        type: "flex",
        altText: "ยืนยันข้อมูลส่วนตัว",
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "✅ ยืนยันข้อมูลส่วนตัว",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #4CAF50 เป็น #FFC107
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📋 ข้อมูลที่บันทึกไว้:",
                        size: "sm",
                        color: "#E65100",
                        weight: "bold"
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "👤 ชื่อ:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: `${userData.prefix || ''}${userData.firstName || ''} ${userData.lastName || ''}`,
                                        size: "sm",
                                        flex: 3,
                                        wrap: true,
                                        color: "#424242"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📱 โทร:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: userData.phone || 'ไม่ระบุ',
                                        size: "sm",
                                        flex: 3,
                                        color: "#424242"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🏠 ที่อยู่:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: `บ้านเลขที่ ${userData.houseNo || ''}, ${userData.moo || ''}`,
                                        size: "sm",
                                        flex: 3,
                                        wrap: true,
                                        color: "#424242"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    },
                    {
                        type: "text",
                        text: "ข้อมูลถูกต้องหรือไม่?",
                        size: "sm",
                        color: "#616161",
                        margin: "lg",
                        align: "center"
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "message",
                            label: "✅ ถูกต้อง ดำเนินการต่อ",
                            text: "ยืนยันข้อมูล"
                        },
                        color: "#4CAF50"
                    },
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "message",
                            label: "✏️ แก้ไขข้อมูล",
                            text: "แก้ไขข้อมูล"
                        }
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createRepairConfirmationFlexMessage(requestData) {
    return {
        type: "flex",
        altText: `การแจ้งซ่อมเลขที่ ${requestData.requestId} สำเร็จ`,
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "✅ แจ้งซ่อมสำเร็จ",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#4CAF50", // คงสีนี้ไว้ (อยู่ในข้อยกเว้น)
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🎫 เลขที่การแจ้งซ่อม`,
                        size: "sm",
                        color: "#E65100",
                        weight: "bold"
                    },
                    {
                        type: "text",
                        text: requestData.requestId,
                        weight: "bold",
                        size: "xl",
                        color: "#FFB300",
                        align: "center",
                        margin: "sm"
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🗼 รหัสเสา:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: requestData.poleId || "ไม่ระบุ",
                                        size: "sm",
                                        flex: 3,
                                        wrap: true,
                                        color: "#424242"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📍 ตำแหน่ง:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: requestData.latitude && requestData.longitude ? 
                                            `${requestData.latitude}, ${requestData.longitude}` : "ไม่ระบุ",
                                        size: "sm",
                                        flex: 3,
                                        wrap: true,
                                        color: "#424242"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⚠️ ปัญหา:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: requestData.problemDescription || requestData.reason,
                                        size: "sm",
                                        flex: 3,
                                        wrap: true,
                                        color: "#424242"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📸 รูปภาพ:",
                                        size: "sm",
                                        color: "#FFB300",
                                        flex: 2,
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: requestData.photoBase64 || requestData.photoMessageId ? "มี" : "ไม่มี",
                                        size: "sm",
                                        flex: 3,
                                        color: "#424242"
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    },
                    {
                        type: "text",
                        text: "📞 เจ้าหน้าที่จะดำเนินการตรวจสอบและติดต่อกลับโดยเร็วที่สุด",
                        size: "sm",
                        color: "#616161",
                        wrap: true,
                        margin: "lg",
                        align: "center"
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "button",
                        style: "link",
                        action: {
                            type: "message",
                            label: "📊 ติดตามสถานะ",
                            text: "ติดตามการซ่อม"
                        }
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createStatusUpdateFlexMessage(requestData, newStatus, technicianNotes) {
    const statusColors = {
        'รอดำเนินการ': '#FFC107', // เปลี่ยนจาก #FFB300 เป็น #FFC107
        'อนุมัติแล้วรอช่าง': '#FFC107', // เปลี่ยนจาก #4CAF50 เป็น #FFC107
        'กำลังดำเนินการ': '#FFC107', // เปลี่ยนจาก #1976D2 เป็น #FFC107
        'เสร็จสิ้น': '#4CAF50', // คงสีนี้ไว้ (อยู่ในข้อยกเว้น)
        'ไม่อนุมัติโดยผู้บริหาร': '#FFC107', // เปลี่ยนจาก #F44336 เป็น #FFC107
        'ยกเลิก': '#FFC107' // เปลี่ยนจาก #616161 เป็น #FFC107
    };

    const statusEmojis = {
        'รอดำเนินการ': '⏳',
        'อนุมัติแล้วรอช่าง': '✅',
        'กำลังดำเนินการ': '🔧',
        'เสร็จสิ้น': '✅',
        'ไม่อนุมัติโดยผู้บริหาร': '❌',
        'ยกเลิก': '🚫'
    };

    return {
        type: "flex",
        altText: `อัปเดตสถานะ: ${newStatus}`,
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `${statusEmojis[newStatus]} อัปเดตสถานะ`,
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: statusColors[newStatus] || "#FFC107", // ใช้ #FFC107 เป็นค่าเริ่มต้น
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🎫 เลขที่: ${requestData.REQUEST_ID}`,
                        weight: "bold",
                        size: "md",
                        color: "#E65100"
                    },
                    {
                        type: "text",
                        text: `📊 สถานะใหม่: ${newStatus}`,
                        size: "md",
                        color: statusColors[newStatus] || "#FFB300",
                        weight: "bold",
                        margin: "md"
                    },
                    ...(technicianNotes ? [{
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    }, {
                        type: "text",
                        text: "📝 หมายเหตุจากเจ้าหน้าที่:",
                        size: "sm",
                        color: "#FFB300",
                        margin: "lg",
                        weight: "bold"
                    }, {
                        type: "text",
                        text: technicianNotes,
                        size: "sm",
                        wrap: true,
                        margin: "sm",
                        color: "#424242"
                    }] : [])
                ],
                paddingAll: "20px"
            }
        }
    };
}

// New Tracking Flex Messages
function createTrackingMethodFlexMessage() {
    return {
        type: "flex",
        altText: "เลือกวิธีติดตามการซ่อม",
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📊 ติดตามการซ่อม",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #1976D2 เป็น #FFC107
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "🔍 เลือกวิธีติดตาม:",
                        weight: "bold",
                        size: "md",
                        color: "#E65100"
                    },
                    {
                        type: "text",
                        text: "กรุณาเลือกวิธีการค้นหาข้อมูลการแจ้งซ่อมของท่าน",
                        size: "sm",
                        color: "#616161",
                        wrap: true,
                        margin: "md"
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "message",
                            label: "🎫 ใช้เลขที่การแจ้งซ่อม",
                            text: "ติดตามด้วยเลขที่"
                        },
                        color: "#FFB300"
                    },
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "message",
                            label: "📱 ใช้เบอร์โทรศัพท์",
                            text: "ติดตามด้วยเบอร์โทร"
                        }
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

function createTrackingResultFlexMessage(requests) {
    if (!requests || requests.length === 0) {
        return {
            type: "flex",
            altText: "ไม่พบข้อมูลการแจ้งซ่อม",
            contents: {
                type: "bubble",
                header: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "❌ ไม่พบข้อมูล",
                            weight: "bold",
                            size: "lg",
                            color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                            align: "center"
                        }
                    ],
                    backgroundColor: "#FFC107", // เปลี่ยนจาก #F44336 เป็น #FFC107
                    paddingAll: "20px"
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "🔍 ไม่พบข้อมูลการแจ้งซ่อม",
                            weight: "bold",
                            size: "md",
                            color: "#E65100",
                            align: "center"
                        },
                        {
                            type: "text",
                            text: "กรุณาตรวจสอบข้อมูลที่ใส่ หรือลองใหม่อีกครั้ง",
                            size: "sm",
                            color: "#616161",
                            wrap: true,
                            margin: "md",
                            align: "center"
                        }
                    ],
                    paddingAll: "20px"
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "button",
                            style: "secondary",
                            action: {
                                type: "message",
                                label: "🔄 ค้นหาใหม่",
                                text: "ติดตามการซ่อม"
                            }
                        }
                    ],
                    paddingAll: "20px"
                }
            }
        };
    }

    // For single result
    if (requests.length === 1) {
        const request = requests[0];
        const statusColors = {
            'รอดำเนินการ': '#FFB300',
            'อนุมัติแล้วรอช่าง': '#4CAF50',
            'กำลังดำเนินการ': '#1976D2',
            'เสร็จสิ้น': '#4CAF50',
            'ไม่อนุมัติโดยผู้บริหาร': '#F44336',
            'ยกเลิก': '#616161'
        };

        const statusEmojis = {
            'รอดำเนินการ': '⏳',
            'อนุมัติแล้วรอช่าง': '✅',
            'กำลังดำเนินการ': '🔧',
            'เสร็จสิ้น': '✅',
            'ไม่อนุมัติโดยผู้บริหาร': '❌',
            'ยกเลิก': '🚫'
        };

        return {
            type: "flex",
            altText: `สถานะการซ่อม: ${request.STATUS}`,
            contents: {
                type: "bubble",
                header: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "📊 สถานะการซ่อม",
                            weight: "bold",
                            size: "lg",
                            color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                            align: "center"
                        }
                    ],
                    backgroundColor: statusColors[request.STATUS] || "#FFC107", // ใช้ #FFC107 เป็นค่าเริ่มต้น
                    paddingAll: "20px"
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: `🎫 ${request.REQUEST_ID}`,
                            weight: "bold",
                            size: "lg",
                            color: "#E65100",
                            align: "center"
                        },
                        {
                            type: "text",
                            text: `${statusEmojis[request.STATUS]} ${request.STATUS}`,
                            weight: "bold",
                            size: "md",
                            color: statusColors[request.STATUS] || "#FFB300",
                            align: "center",
                            margin: "md"
                        },
                        {
                            type: "separator",
                            margin: "lg",
                            color: "#FFE0B2"
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "lg",
                            spacing: "sm",
                            contents: [
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "📅 วันที่แจ้ง:",
                                            size: "sm",
                                            color: "#FFB300",
                                            flex: 2,
                                            weight: "bold"
                                        },
                                        {
                                            type: "text",
                                            text: request.DATE_REPORTED || 'ไม่ระบุ',
                                            size: "sm",
                                            flex: 3,
                                            color: "#424242"
                                        }
                                    ]
                                },
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "🗼 รหัสเสา:",
                                            size: "sm",
                                            color: "#FFB300",
                                            flex: 2,
                                            weight: "bold"
                                        },
                                        {
                                            type: "text",
                                            text: request.POLE_ID || 'ไม่ระบุ',
                                            size: "sm",
                                            flex: 3,
                                            color: "#424242"
                                        }
                                    ]
                                },
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "⚠️ ปัญหา:",
                                            size: "sm",
                                            color: "#FFB300",
                                            flex: 2,
                                            weight: "bold"
                                        },
                                        {
                                            type: "text",
                                            text: request.PROBLEM_DESCRIPTION || request.REASON || 'ไม่ระบุ',
                                            size: "sm",
                                            flex: 3,
                                            wrap: true,
                                            color: "#424242"
                                        }
                                    ]
                                }
                            ]
                        },
                        ...(request.TECHNICIAN_NOTES ? [{
                            type: "separator",
                            margin: "lg",
                            color: "#FFE0B2"
                        }, {
                            type: "text",
                            text: "📝 หมายเหตุ:",
                            size: "sm",
                            color: "#FFB300",
                            weight: "bold",
                            margin: "lg"
                        }, {
                            type: "text",
                            text: request.TECHNICIAN_NOTES,
                            size: "sm",
                            wrap: true,
                            color: "#424242",
                            margin: "sm"
                        }] : [])
                    ],
                    paddingAll: "20px"
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "button",
                            style: "secondary",
                            action: {
                                type: "message",
                                label: "🔄 ค้นหาใหม่",
                                text: "ติดตามการซ่อม"
                            }
                        }
                    ],
                    paddingAll: "20px"
                }
            }
        };
    }

    // For multiple results
    return {
        type: "flex",
        altText: `พบ ${requests.length} รายการ`,
        contents: {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📋 รายการแจ้งซ่อม",
                        weight: "bold",
                        size: "lg",
                        color: "#0D47A1", // เปลี่ยนจาก #FFFFFF เป็น #0D47A1
                        align: "center"
                    }
                ],
                backgroundColor: "#FFC107", // เปลี่ยนจาก #1976D2 เป็น #FFC107
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🔍 พบ ${requests.length} รายการ`,
                        weight: "bold",
                        size: "md",
                        color: "#E65100"
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#FFE0B2"
                    },
                    ...requests.slice(0, 3).map((request, index) => ({
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: `🎫 ${request.REQUEST_ID}`,
                                weight: "bold",
                                size: "sm",
                                color: "#FFB300"
                            },
                            {
                                type: "text",
                                text: `📊 ${request.STATUS}`,
                                size: "xs",
                                color: "#616161"
                            },
                            {
                                type: "text",
                                text: `📅 ${request.DATE_REPORTED || 'ไม่ระบุ'}`,
                                size: "xs",
                                color: "#616161"
                            },
                            ...(index < Math.min(requests.length - 1, 2) ? [{
                                type: "separator",
                                margin: "sm",
                                color: "#FFE0B2"
                            }] : [])
                        ]
                    }))
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "message",
                            label: "🔄 ค้นหาใหม่",
                            text: "ติดตามการซ่อม"
                        }
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

// --- General Routes ---
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'LINE Bot API & Admin API for อบต.ข่าใหญ่ is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      personal_info_form: `${config.BASE_URL}/form?userId=TEST_USER_ID`,
      repair_form: `${config.BASE_URL}/repair-form.html?userId=TEST_USER_ID`,
      line_webhook: `${config.BASE_URL}/webhook`,
      react_admin_app: `${config.BASE_URL}/mobile`,
      admin_login_page_html: `${config.BASE_URL}/admin/login`,
      admin_dashboard_page_html: `${config.BASE_URL}/admin/dashboard`,
      admin_executive_dashboard_page_html: `${config.BASE_URL}/admin/executive-dashboard`,
    }
  });
});

app.get('/form', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.get('/repair-form.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'repair-form.html'));
});

// --- API Endpoints ---

// API สำหรับฟอร์มข้อมูลส่วนตัว (เดิม)
app.post('/api/form-submit', async (req, res) => {
  try {
    const { lineUserId, titlePrefix, firstName, lastName, phone, houseNo, moo } = req.body;
    if (!lineUserId || !titlePrefix || !firstName || !lastName || !phone || !houseNo || !moo) {
      return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    if (!/^[0-9]{9,10}$/.test(phone)) {
      return res.status(400).json({ status: 'error', message: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (9-10 หลัก)' });
    }
    const userProfile = await lineService.getLineUserProfile(lineUserId);
    const lineDisplayName = userProfile ? userProfile.displayName : 'N/A';

    const personalData = { lineUserId, lineDisplayName, prefix: titlePrefix, firstName, lastName, phone, houseNo, moo, personalInfoConfirmed: false };
    setUserData(lineUserId, personalData);
    setUserState(lineUserId, config.STATES.AWAITING_USER_DATA_CONFIRMATION);

    const confirmationMessage = createPersonalInfoConfirmationFlexMessage(personalData);
    await lineService.pushMessage(lineUserId, [confirmationMessage]);
    
    res.json({ status: 'success', message: 'ข้อมูลของท่านถูกส่งไปยัง LINE เพื่อยืนยันแล้ว กรุณากลับไปที่แอปพลิเคชัน LINE' });
  } catch (error) {
    console.error('❌ Error in /api/form-submit:', error.message, error.stack);
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการประมวลผลข้อมูลฟอร์ม: ' + error.message });
  }
});

// API สำหรับฟอร์มแจ้งซ่อมใหม่
app.post('/api/repair-form-submit', async (req, res) => {
  try {
    const { lineUserId, poleId, latitude, longitude, problemDescription, photoBase64 } = req.body;
    
    if (!lineUserId || !problemDescription) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' 
      });
    }

    // ดึงข้อมูลผู้ใช้จาก LINE
    const userProfile = await lineService.getLineUserProfile(lineUserId);
    const lineDisplayName = userProfile ? userProfile.displayName : 'ผู้ใช้ LINE';

    // ดึงข้อมูลส่วนตัวที่บันทึกไว้
    const personalDetails = await googleSheetsService.getUserPersonalDetails(lineUserId);

    // สร้างเลขที่คำขอ
    const requestId = generateRequestId();

    // เตรียมข้อมูลสำหรับบันทึก
    const requestData = {
      lineUserId,
      lineDisplayName,
      requestId,
      poleId: poleId || 'ไม่ระบุ',
      latitude: latitude || null,
      longitude: longitude || null,
      problemDescription,
      photoBase64: photoBase64 || null,
      dateReported: new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE }),
      status: 'รอดำเนินการ',
      // เพิ่มข้อมูลส่วนตัวถ้ามี
      personalDetails: personalDetails || {}
    };

    // บันทึกลง Google Sheets
    const success = await googleSheetsService.saveRepairRequestFromForm(requestData);
    
    if (success) {
      // ส่ง Flex Message ยืนยันการแจ้งซ่อม
      const confirmationMessage = createRepairConfirmationFlexMessage(requestData);
      await lineService.pushMessage(lineUserId, [confirmationMessage]);
      
    // ส่งแจ้งเตือน Telegram
    const personalInfo = personalDetails ? 
      `👤 ผู้แจ้ง: ${escapeMarkdown(personalDetails.prefix || '')}${escapeMarkdown(personalDetails.firstName || '')} ${escapeMarkdown(personalDetails.lastName || '')} (${escapeMarkdown(lineDisplayName)})
    📱 เบอร์โทร: ${escapeMarkdown(personalDetails.phone || 'ไม่ระบุ')}
    🏠 ที่อยู่: ${personalDetails.houseNo ? `บ้านเลขที่ ${escapeMarkdown(personalDetails.houseNo)}, ${escapeMarkdown(personalDetails.moo)}` : 'ไม่ระบุ'}` :
      `👤 ผู้แจ้ง: ${escapeMarkdown(lineDisplayName)} (ยังไม่มีข้อมูลส่วนตัว)`;

    const telegramMessage = `🆕 *คำขอแจ้งซ่อมใหม่*

    🎫 เลขที่: *${escapeMarkdown(requestId)}*
    ${personalInfo}
    🗼 รหัสเสา: ${escapeMarkdown(poleId || 'ไม่ระบุ')}
    📍 พิกัด: ${latitude && longitude ? `${latitude}, ${longitude}` : 'ไม่ระบุ'}
    ⚠️ ปัญหา: ${escapeMarkdown(problemDescription)}
    📸 รูปภาพ: ${photoBase64 ? 'มี' : 'ไม่มี'}

    📅 วันที่แจ้ง: ${escapeMarkdown(requestData.dateReported)}`;

    await sendTelegramNotification(telegramMessage, true);
      
      res.json({ 
        status: 'success', 
        message: 'ส่งข้อมูลการแจ้งซ่อมสำเร็จ',
        requestId: requestId
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' 
      });
    }
  } catch (error) {
    console.error('❌ Error in /api/repair-form-submit:', error.message, error.stack);
    res.status(500).json({ 
      status: 'error', 
      message: 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล: ' + error.message 
    });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No events to process' });
    }
    
    for (const event of events) {
      if (!event.source || !event.source.userId) {
        console.warn('⚠️ Event without userId, skipping:', JSON.stringify(event));
        continue;
      }
      
      const userId = event.source.userId;
      
      if (event.type === 'follow') {
        await handleFollowEvent(userId, event.replyToken);
      } else if (event.type === 'message') {
        await handleMessageEvent(userId, event.message, event.replyToken);
      } else if (event.type === 'postback') {
        await handlePostbackEvent(userId, event.postback, event.replyToken);
      }
    }
    
    res.status(200).json({ status: 'success', message: 'Events processed' });
  } catch (error) {
    console.error('❌ Error in /webhook:', error.message, error.stack);
    res.status(200).json({ status: 'error', message: 'Internal server error occurred' });
  }
});

// --- Admin API Endpoints ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const adminUser = await googleSheetsService.findAdminUserByUsername(username);

        if (adminUser && adminUser.PASSWORD_HASH && password === adminUser.PASSWORD_HASH && String(adminUser.IS_ACTIVE).toLowerCase() === 'true') {
            const userPayload = { username: adminUser.USERNAME, role: adminUser.ROLE };
            const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '8h' });
            await googleSheetsService.updateAdminUser(username, { LAST_LOGIN: new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE }) });
            res.json({ status: 'success', message: 'เข้าสู่ระบบสำเร็จ!', token: token, role: adminUser.ROLE, username: adminUser.USERNAME });
        } else if (adminUser && String(adminUser.IS_ACTIVE).toLowerCase() !== 'true') {
            res.status(401).json({ status: 'error', message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' });
        } else {
            res.status(401).json({ status: 'error', message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
        }
    } catch (error) {
        console.error('Login API error:', error.message, error.stack);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message });
    }
});

app.get('/api/admin/repair-requests', authenticateAdminToken, async (req, res) => {
    try {
        const { limit, sortBy, filterByStatus } = req.query;
        const options = {
            limit: limit ? parseInt(limit) : 0,
            sortBy: sortBy || 'newest',
            filterByStatus: filterByStatus || undefined
        };
        const requests = await googleSheetsService.getAllRepairRequests(options);
        res.json({ status: 'success', data: requests });
    } catch (error) {
        console.error('❌ Error fetching repair requests for admin:', error.message, error.stack);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลรายการแจ้งซ่อมได้' });
    }
});

app.get('/api/admin/repair-request/:id', authenticateAdminToken, async (req, res) => {
    try {
        const requestId = req.params.id;
        if (!requestId) {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุเลขที่คำขอ' });
        }
        const requestData = await googleSheetsService.findRepairRequestById(requestId);
        if (requestData) {
            res.json({ status: 'success', data: requestData });
        } else {
            res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลคำขอแจ้งซ่อม' });
        }
    } catch (error) {
        console.error(`❌ Error fetching details for request ID ${req.params.id}:`, error.message, error.stack);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลรายละเอียดคำขอได้' });
    }
});

app.put('/api/admin/repair-request/:id/status', authenticateAdminToken, async (req, res) => {
    try {
        const requestId = req.params.id;
        const { newStatus, technicianNotes, signatureUrl, approvalTimestampClient } = req.body;
        const approverUsername = req.user.username;
        const approverRole = req.user.role;

        if (!requestId) {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุเลขที่คำขอ' });
        }
        if (typeof newStatus === 'undefined' && typeof technicianNotes === 'undefined' && typeof signatureUrl === 'undefined' && typeof approvalTimestampClient === 'undefined') {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุข้อมูลสำหรับการอัปเดตอย่างน้อยหนึ่งอย่าง' });
        }

        const executiveActionStatuses = ["อนุมัติแล้วรอช่าง", "ไม่อนุมัติโดยผู้บริหาร"];
        let isExecutiveApprovalAction = false;
        let finalSignatureUrl = undefined;
        let finalApprovedBy = undefined;
        let finalApprovalTimestamp = undefined;

        if (newStatus && executiveActionStatuses.includes(newStatus)) {
            if (approverRole !== 'executive' && approverRole !== 'admin') {
                return res.status(403).json({ status: 'error', message: 'คุณไม่มีสิทธิ์ในการตั้งค่าสถานะนี้' });
            }
            isExecutiveApprovalAction = true;
            finalSignatureUrl = signatureUrl;
            finalApprovedBy = approverUsername;
            finalApprovalTimestamp = approvalTimestampClient || new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE });
            if (newStatus === "อนุมัติแล้วรอช่าง" && !signatureUrl) {
                 console.warn(`⚠️ Missing signatureUrl for executive approval of request ${requestId} by ${approverUsername}.`);
            }
        }
        
        const success = await googleSheetsService.updateRepairRequestStatus(
            requestId, newStatus, technicianNotes,
            isExecutiveApprovalAction ? finalSignatureUrl : undefined,
            isExecutiveApprovalAction ? finalApprovedBy : undefined,
            isExecutiveApprovalAction ? finalApprovalTimestamp : undefined
        );
        
        if (success) {
            const requestDetails = await googleSheetsService.findRepairRequestById(requestId);
            if (requestDetails) {
                // ส่งแจ้งเตือน LINE ให้ผู้ใช้ด้วย Flex Message
                if (requestDetails.LINE_USER_ID && newStatus) {
                   try {
                       const statusUpdateMessage = createStatusUpdateFlexMessage(requestDetails, newStatus, technicianNotes);
                       await lineService.pushMessage(requestDetails.LINE_USER_ID, [statusUpdateMessage]);
                   } catch (lineError) {
                       console.error(`⚠️ Failed to send LINE notification to user ${requestDetails.LINE_USER_ID} for ${requestId}:`, lineError.message);
                   }
                }
                
                // ส่งแจ้งเตือน Telegram
                if (newStatus) {
                  const statusEmoji = {
                      'รอดำเนินการ': '⏳',
                      'อนุมัติแล้วรอช่าง': '✅',
                      'กำลังดำเนินการ': '🔧',
                      'เสร็จสิ้น': '✅',
                      'ไม่อนุมัติโดยผู้บริหาร': '❌',
                      'ยกเลิก': '🚫'
                  };

                  // ✅ ใช้ escapeMarkdown และตรวจสอบข้อมูล
                  const safePersonName = `${escapeMarkdown(requestDetails.TITLE_PREFIX || '')}${escapeMarkdown(requestDetails.FIRST_NAME || '')} ${escapeMarkdown(requestDetails.LAST_NAME || '')}`.trim();
                  const safePhone = escapeMarkdown(requestDetails.PHONE || 'ไม่ระบุ');
                  const safeHouseAddress = requestDetails.HOUSE_NO ? 
                      `บ้านเลขที่ ${escapeMarkdown(requestDetails.HOUSE_NO)}, หมู่ ${escapeMarkdown(requestDetails.MOO)}` : 
                      'ไม่ระบุ';
                  const safePoleId = escapeMarkdown(requestDetails.POLE_ID || 'ไม่ระบุ');
                  const safeStatus = escapeMarkdown(newStatus);
                  const safeRequestId = escapeMarkdown(requestId);
                  const safeTechnicianNotes = technicianNotes ? escapeMarkdown(technicianNotes) : '';
                  const safeApprovedBy = finalApprovedBy ? escapeMarkdown(finalApprovedBy) : '';

                  const telegramMessage = `${statusEmoji[newStatus] || '🔄'} *อัปเดตสถานะคำขอแจ้งซ่อม*

              🎫 เลขที่: *${safeRequestId}*
              👤 ผู้แจ้ง: ${safePersonName}
              📱 เบอร์โทร: ${safePhone}
              🏠 ที่อยู่: ${safeHouseAddress}
              🗼 รหัสเสา: ${safePoleId}

              📊 สถานะใหม่: *${safeStatus}*
              ${safeTechnicianNotes ? `📝 หมายเหตุ: ${safeTechnicianNotes}\n` : ''}${safeApprovedBy ? `👨‍💼 ดำเนินการโดย: ${safeApprovedBy}\n` : ''}
              📅 เวลาอัปเดต: ${new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE })}`;

                  await sendTelegramNotification(telegramMessage, true);
              }
            }
            res.json({ status: 'success', message: 'อัปเดตสถานะและข้อมูลการอนุมัติเรียบร้อยแล้ว' });
        } else {
            res.status(404).json({ status: 'error', message: 'ไม่สามารถอัปเดตสถานะได้ อาจไม่พบคำขอหรือเกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    } catch (error) {
        console.error(`❌ Error updating status for request ID ${req.params.id}:`, error.message, error.stack);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + error.message });
    }
});

app.get('/api/admin/dashboard-summary', authenticateAdminToken, async (req, res) => {
    try {
        const summary = await googleSheetsService.getRepairRequestsSummary();
        res.json({ status: 'success', summary: summary });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลสรุปได้' });
    }
});

// Pole Management APIs
app.get('/api/admin/poles', authenticateAdminToken, async (req, res) => {
    try {
        const { search } = req.query;
        const options = { search: search || undefined };
        const poles = await googleSheetsService.getAllPoles(options);
        res.json({ status: 'success', data: poles });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลเสาไฟฟ้าได้' });
    }
});

app.get('/api/admin/poles/:poleId', authenticateAdminToken, async (req, res) => {
    try {
        const poleIdToFind = req.params.poleId;
        if (!poleIdToFind) return res.status(400).json({ status: 'error', message: 'กรุณาระบุรหัสเสาไฟฟ้า' });
        const poleData = await googleSheetsService.findPoleByPoleId(poleIdToFind);
        if (poleData) res.json({ status: 'success', data: poleData });
        else res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลเสาไฟฟ้า' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลรายละเอียดเสาไฟฟ้าได้' });
    }
});

app.post('/api/admin/poles', authenticateAdminToken, async (req, res) => {
    try {
        const poleDataFromForm = req.body;
        if (!poleDataFromForm || !poleDataFromForm.poleId || !poleDataFromForm.village) {
            return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลที่จำเป็น (รหัสเสาไฟฟ้า, หมู่บ้าน) ให้ครบถ้วน' });
        }
        const success = await googleSheetsService.addPole(poleDataFromForm);
        if (success) res.status(201).json({ status: 'success', message: 'เพิ่มข้อมูลเสาไฟฟ้าใหม่สำเร็จ', data: poleDataFromForm });
        else res.status(500).json({ status: 'error', message: 'ไม่สามารถเพิ่มข้อมูลเสาไฟฟ้าได้ (service layer error)' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการเพิ่มข้อมูลเสาไฟฟ้า: ' + error.message });
    }
});

app.put('/api/admin/poles/:poleId', authenticateAdminToken, async (req, res) => {
    try {
        const originalPoleId = req.params.poleId;
        const updatedPoleData = req.body;
        if (!originalPoleId) return res.status(400).json({ status: 'error', message: 'กรุณาระบุรหัสเสาไฟฟ้าที่จะแก้ไข' });
        if (!updatedPoleData || !updatedPoleData.poleId || !updatedPoleData.village) {
             return res.status(400).json({ status: 'error', message: 'ข้อมูลที่ส่งมาสำหรับแก้ไขไม่ครบถ้วน (รหัสเสาไฟฟ้า, หมู่บ้าน)' });
        }
        const success = await googleSheetsService.updatePoleByPoleId(originalPoleId, updatedPoleData);
        if (success) res.json({ status: 'success', message: 'แก้ไขข้อมูลเสาไฟฟ้าสำเร็จ', data: updatedPoleData });
        else res.status(404).json({ status: 'error', message: 'ไม่สามารถแก้ไขข้อมูลเสาไฟฟ้าได้ อาจไม่พบข้อมูลหรือเกิดข้อผิดพลาด' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลเสาไฟฟ้า: ' + error.message });
    }
});

// Inventory Management APIs
app.get('/api/admin/inventory', authenticateAdminToken, async (req, res) => {
    try {
        const { search } = req.query;
        const options = { search: search || undefined };
        const items = await googleSheetsService.getAllInventoryItems(options);
        res.json({ status: 'success', data: items });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลคลังอุปกรณ์ได้' });
    }
});

app.post('/api/admin/inventory', authenticateAdminToken, async (req, res) => {
    try {
        const itemData = req.body;
        if (!itemData || !itemData.itemName || !itemData.unit || typeof itemData.pricePerUnit === 'undefined' || typeof itemData.currentStock === 'undefined') {
            return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลวัสดุให้ครบถ้วน (รายการ, หน่วย, ราคา/หน่วย, จำนวนคงเหลือ)' });
        }
        const success = await googleSheetsService.addInventoryItem(itemData);
        if (success) res.status(201).json({ status: 'success', message: 'เพิ่มรายการวัสดุใหม่สำเร็จ', data: itemData });
    } catch (error) {
        if (error.message.includes("มีอยู่ในคลังแล้ว")) return res.status(409).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการเพิ่มรายการวัสดุ: ' + error.message });
    }
});

app.put('/api/admin/inventory/:itemName', authenticateAdminToken, async (req, res) => {
    try {
        const originalItemName = decodeURIComponent(req.params.itemName);
        const updatedItemData = req.body;
        if (!originalItemName) return res.status(400).json({ status: 'error', message: 'กรุณาระบุชื่อรายการวัสดุที่จะแก้ไข' });
        if (!updatedItemData || !updatedItemData.itemName) return res.status(400).json({ status: 'error', message: 'ข้อมูลชื่อรายการใหม่ไม่ถูกต้อง' });
        const success = await googleSheetsService.updateInventoryItem(originalItemName, updatedItemData);
        if (success) res.json({ status: 'success', message: 'แก้ไขข้อมูลวัสดุสำเร็จ', data: updatedItemData });
    } catch (error) {
        if (error.message.includes("ซ้ำกับที่มีอยู่แล้ว")) return res.status(409).json({ status: 'error', message: error.message });
        else if (error.message.includes("ไม่พบรายการวัสดุ")) return res.status(404).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลวัสดุ: ' + error.message });
    }
});

app.post('/api/admin/inventory/adjust', authenticateAdminToken, async (req, res) => {
    try {
        const { itemName, quantityChange, transactionType } = req.body;
        if (!itemName || typeof quantityChange === 'undefined' || !transactionType) {
            return res.status(400).json({ status: 'error', message: 'ข้อมูลไม่ครบถ้วน (ชื่อรายการ, จำนวน, ประเภทการทำรายการ)' });
        }
        const numQuantityChange = parseFloat(quantityChange);
        if (isNaN(numQuantityChange) || numQuantityChange <= 0) {
            return res.status(400).json({ status: 'error', message: 'จำนวนต้องเป็นตัวเลขที่มากกว่า 0' });
        }
        const success = await googleSheetsService.adjustInventoryQuantity(itemName, numQuantityChange, transactionType);
        if (success) res.json({ status: 'success', message: `ปรับปรุงจำนวน "${itemName}" เรียบร้อยแล้ว` });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
});

// Admin User Management APIs
app.get('/api/admin/users', authenticateAdminToken, async (req, res) => {
    try {
        const adminUsers = await googleSheetsService.getAllAdminUsers();
        res.json({ status: 'success', data: adminUsers });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลผู้ดูแลระบบได้' });
    }
});

app.post('/api/admin/users', authenticateAdminToken, async (req, res) => {
    try {
        const { username, password, role, fullName, email, isActive } = req.body;
        if (!username || !password || !role) return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลที่จำเป็น (Username, Password, Role) ให้ครบถ้วน' });
        const hashedPassword = password;
        const adminUserData = { USERNAME: username, PASSWORD_HASH: hashedPassword, ROLE: role, FULL_NAME: fullName || '', EMAIL: email || '', IS_ACTIVE: isActive !== undefined ? isActive : true, };
        const success = await googleSheetsService.addAdminUser(adminUserData);
        if (success) {
            const { PASSWORD_HASH, ...userDataToReturn } = adminUserData;
            res.status(201).json({ status: 'success', message: 'เพิ่มผู้ดูแลระบบใหม่สำเร็จ', data: userDataToReturn });
        }
    } catch (error) {
        if (error.message.includes("มีอยู่ในระบบแล้ว")) return res.status(409).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการเพิ่มผู้ดูแลระบบ: ' + error.message });
    }
});

app.get('/api/admin/users/:username', authenticateAdminToken, async (req, res) => {
    try {
        const usernameToFind = req.params.username;
        if (!usernameToFind) return res.status(400).json({ status: 'error', message: 'กรุณาระบุ Username' });
        const userData = await googleSheetsService.findAdminUserByUsername(usernameToFind);
        if (userData) { const { PASSWORD_HASH, ...userDataToReturn } = userData; res.json({ status: 'success', data: userDataToReturn }); }
        else res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลผู้ดูแลระบบ' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลผู้ดูแลระบบได้' });
    }
});

app.put('/api/admin/users/:username', authenticateAdminToken, async (req, res) => {
    try {
        const usernameToUpdate = req.params.username;
        const { role, fullName, email, isActive, password } = req.body;
        if (!usernameToUpdate) return res.status(400).json({ status: 'error', message: 'กรุณาระบุ Username ของผู้ใช้ที่ต้องการแก้ไข' });
        const updateData = {};
        if (typeof role !== 'undefined') updateData.ROLE = role;
        if (typeof fullName !== 'undefined') updateData.FULL_NAME = fullName;
        if (typeof email !== 'undefined') updateData.EMAIL = email;
        if (typeof isActive !== 'undefined') updateData.IS_ACTIVE = isActive;
        if (password) updateData.PASSWORD_HASH = password;
        if (Object.keys(updateData).length === 0) return res.status(400).json({ status: 'error', message: 'ไม่มีข้อมูลสำหรับการอัปเดต' });
        const success = await googleSheetsService.updateAdminUser(usernameToUpdate, updateData);
        if (success) res.json({ status: 'success', message: `แก้ไขข้อมูลผู้ดูแลระบบ "${usernameToUpdate}" สำเร็จ` });
        else res.status(404).json({ status: 'error', message: `ไม่พบผู้ดูแลระบบ "${usernameToUpdate}" หรือไม่สามารถแก้ไขได้` });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ดูแลระบบ: ' + error.message });
    }
});

app.delete('/api/admin/users/:username', authenticateAdminToken, async (req, res) => {
    try {
        const usernameToDelete = req.params.username;
        if (!usernameToDelete) return res.status(400).json({ status: 'error', message: 'กรุณาระบุ Username ของผู้ใช้ที่ต้องการลบ' });
        if (usernameToDelete === (process.env.ADMIN_USERNAME || 'admin') || usernameToDelete === req.user.username) {
             return res.status(403).json({ status: 'error', message: 'ไม่สามารถลบบัญชีผู้ดูแลระบบหลักหรือบัญชีที่กำลังใช้งานอยู่ได้' });
        }
        const success = await googleSheetsService.deleteAdminUser(usernameToDelete);
        if (success) res.json({ status: 'success', message: `ลบผู้ดูแลระบบ "${usernameToDelete}" สำเร็จ` });
        else res.status(404).json({ status: 'error', message: `ไม่พบผู้ดูแลระบบ "${usernameToDelete}" หรือไม่สามารถลบได้` });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการลบผู้ดูแลระบบ: ' + error.message });
    }
});

// API Endpoint for uploading signature to Google Drive
app.post('/api/admin/upload-signature', authenticateAdminToken, async (req, res) => {
    try {
        const { imageDataUrl, fileNamePrefix } = req.body;
        const username = req.user ? req.user.username : 'unknown_user';
        if (!imageDataUrl) return res.status(400).json({ status: 'error', message: 'No image data provided.' });
        if (!config.GOOGLE_DRIVE_SIGNATURE_FOLDER_ID) {
            console.error('❌ GOOGLE_DRIVE_SIGNATURE_FOLDER_ID is not configured');
            return res.status(500).json({ status: 'error', message: 'Server configuration error for Google Drive.' });
        }
        const matches = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ status: 'error', message: 'Invalid image data format.' });

        const mimeType = matches[1];
        const base64Data = matches[2];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(imageBuffer);
        const anonyfileNamePrefix = fileNamePrefix ? fileNamePrefix.replace(/[^a-zA-Z0-9-_]/g, '') : 'signature';
        const fileName = `${anonyfileNamePrefix}_${username}_${Date.now()}.png`;

        const serviceAccountAuthForDrive = new jwt.JWT({
            email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: config.GOOGLE_PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        const drive = google.drive({ version: 'v3', auth: serviceAccountAuthForDrive });
        const fileMetadata = { name: fileName, parents: [config.GOOGLE_DRIVE_SIGNATURE_FOLDER_ID], mimeType: mimeType, };
        const media = { mimeType: mimeType, body: bufferStream, };
        const driveResponse = await drive.files.create({ requestBody: fileMetadata, media: media, fields: 'id, webViewLink, webContentLink', });
        const fileId = driveResponse.data.id;
        const webViewLink = driveResponse.data.webViewLink;
        if (!fileId) throw new Error('Failed to upload to Google Drive, no file ID returned.');
        await drive.permissions.create({ fileId: fileId, requestBody: { role: 'reader', type: 'anyone', }, });
        res.json({ status: 'success', message: 'ลายเซ็นอัปโหลดสำเร็จ!', signatureUrl: webViewLink, fileId: fileId });
    } catch (error) {
        console.error('❌ Error uploading signature to Google Drive:', error.message, error.stack);
        if (error.response && error.response.data) console.error('Google API Error Details:', JSON.stringify(error.response.data, null, 2));
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปโหลดลายเซ็น: ' + error.message });
    }
});

// --- Telegram Configuration API Endpoints ---
app.get('/api/admin/telegram-config', authenticateAdminToken, async (req, res) => {
    try {
        const config = await googleSheetsService.getTelegramConfig();
        res.json({ status: 'success', data: config });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลการตั้งค่า Telegram ได้' });
    }
});

app.post('/api/admin/telegram-config', authenticateAdminToken, async (req, res) => {
    try {
        const { botToken, chatId, isEnabled, testMessage } = req.body;
        
        if (typeof botToken === 'undefined' || typeof chatId === 'undefined' || typeof isEnabled === 'undefined') {
            return res.status(400).json({ 
                status: 'error', 
                message: 'ข้อมูลไม่ครบถ้วน (botToken, chatId, isEnabled)' 
            });
        }

        // ทดสอบการเชื่อมต่อก่อนบันทึก (ถ้าเปิดใช้งาน)
        if (isEnabled && botToken && chatId) {
            const testResult = await testTelegramNotification(botToken, chatId);
            if (!testResult) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'ไม่สามารถเชื่อมต่อ Telegram ได้ กรุณาตรวจสอบ Bot Token และ Chat ID' 
                });
            }
        }

        const configData = { botToken, chatId, isEnabled };
        const success = await googleSheetsService.saveTelegramConfig(configData);
        
        if (success) {
            // ส่งข้อความทดสอบเพิ่มเติมถ้าร้องขอ
            if (testMessage && isEnabled) {
                await sendTelegramNotification(
                    `✅ *การตั้งค่า Telegram สำเร็จ!*\n\nระบบแจ้งเตือนพร้อมใช้งานแล้ว\n📅 ${new Date().toLocaleString('th-TH', { timeZone: config.TIMEZONE })}`,
                    true
                );
            }
            
            res.json({ 
                status: 'success', 
                message: 'บันทึกการตั้งค่า Telegram สำเร็จ' 
            });
        } else {
            res.status(500).json({ 
                status: 'error', 
                message: 'ไม่สามารถบันทึกการตั้งค่า Telegram ได้' 
            });
        }
    } catch (error) {
        console.error('Error saving Telegram settings:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า Telegram: ' + error.message 
        });
    }
});

app.post('/api/admin/telegram-test', authenticateAdminToken, async (req, res) => {
    try {
        const { botToken, chatId } = req.body;
        
        if (!botToken || !chatId) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'กรุณาระบุ Bot Token และ Chat ID' 
            });
        }

        const testResult = await testTelegramNotification(botToken, chatId);
        
        if (testResult) {
            res.json({ 
                status: 'success', 
                message: 'การทดสอบ Telegram สำเร็จ!' 
            });
        } else {
            res.status(400).json({ 
                status: 'error', 
                message: 'การทดสอบ Telegram ล้มเหลว กรุณาตรวจสอบการตั้งค่า' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'เกิดข้อผิดพลาดในการทดสอบ: ' + error.message 
        });
    }
});

// สร้างรายงานคำขอแจ้งซ่อม PDF
app.post('/api/admin/reports/repair-requests/pdf', authenticateAdminToken, async (req, res) => {
    // ตรวจสอบว่า PDF service พร้อมใช้งานหรือไม่
    if (!pdfService || typeof pdfService.createRepairRequestsReport !== 'function') {
        return res.status(503).json({
            status: 'error',
            message: 'PDF service ไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ (puppeteer ยังไม่ได้ติดตั้ง)',
            suggestion: 'คุณสามารถส่งออกข้อมูลในรูปแบบอื่น เช่น Excel หรือ CSV ได้'
        });
    }
    
    try {
        const {
            filterStatus,
            dateRange,
            templateOptions = {},
            pdfOptions = {}
        } = req.body;

        let queryOptions = {};
        if (filterStatus) {
            queryOptions.filterByStatus = filterStatus;
        }

        const requests = await googleSheetsService.getAllRepairRequests(queryOptions);

        let filteredRequests = requests;
        if (dateRange && dateRange.start && dateRange.end) {
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
            
            filteredRequests = requests.filter(request => {
                if (!request.DATE_REPORTED) return false;
                
                let requestDate;
                try {
                    if (request.DATE_REPORTED.includes(',')) {
                        const [datePart] = request.DATE_REPORTED.split(',');
                        const [day, month, year] = datePart.trim().split('/');
                        let fullYear = parseInt(year);
                        if (fullYear > 2500) fullYear -= 543;
                        requestDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
                    } else {
                        requestDate = new Date(request.DATE_REPORTED);
                    }
                } catch (error) {
                    console.error('Date parsing error:', error);
                    return false;
                }
                
                return requestDate >= startDate && requestDate <= endDate;
            });
        }

        const finalTemplateOptions = {
            title: `รายงานคำขอแจ้งซ่อมไฟฟ้า${filterStatus ? ` (สถานะ: ${filterStatus})` : ''}`,
            headerColor: '#2563eb',
            showDate: true,
            filterStatus: filterStatus,
            dateRange: dateRange ? `${new Date(dateRange.start).toLocaleDateString('th-TH')} ถึง ${new Date(dateRange.end).toLocaleDateString('th-TH')}` : null,
            ...templateOptions
        };

        const result = await pdfService.createRepairRequestsReport(filteredRequests, finalTemplateOptions);

        if (result.success) {
            const filename = `รายงานคำขอแจ้งซ่อม_${new Date().toISOString().split('T')[0]}.pdf`;
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Length', result.pdf.length);
            res.send(result.pdf);
        } else {
            res.status(500).json({
                status: 'error',
                message: 'ไม่สามารถสร้างรายงาน PDF ได้: ' + result.error
            });
        }
    } catch (error) {
        console.error('Error generating repair requests PDF:', error);
        res.status(500).json({
            status: 'error',
            message: 'เกิดข้อผิดพลาดในการสร้างรายงาน PDF: ' + error.message
        });
    }
});

app.post('/api/admin/request/:id/pdf', authenticateAdminToken, async (req, res) => {
    // ตรวจสอบว่า PDF service พร้อมใช้งานหรือไม่
    if (!pdfService || typeof pdfService.createSingleRequestDocument !== 'function') {
        return res.status(503).json({
            status: 'error',
            message: 'PDF service ไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ (puppeteer ยังไม่ได้ติดตั้ง)',
            suggestion: 'คุณสามารถดูข้อมูลบนหน้าจอและใช้ฟังก์ชัน Print ของเบราว์เซอร์ได้'
        });
    }
    
    try {
        const requestId = req.params.id;
        const { templateOptions = {} } = req.body;

        if (!requestId) {
            return res.status(400).json({
                status: 'error',
                message: 'กรุณาระบุเลขที่คำขอ'
            });
        }

        const requestData = await googleSheetsService.findRepairRequestById(requestId);
        if (!requestData) {
            return res.status(404).json({
                status: 'error',
                message: 'ไม่พบข้อมูลคำขอแจ้งซ่อม'
            });
        }

        const result = await pdfService.createSingleRequestDocument(requestData, templateOptions);

        if (result.success) {
            const filename = `คำร้องแจ้งซ่อม_${requestId}.pdf`;
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Length', result.pdf.length);
            res.send(result.pdf);
        } else {
            res.status(500).json({
                status: 'error',
                message: 'ไม่สามารถสร้างเอกสาร PDF ได้: ' + result.error
            });
        }
    } catch (error) {
        console.error(`Error generating PDF for request ${req.params.id}:`, error);
        res.status(500).json({
            status: 'error',
            message: 'เกิดข้อผิดพลาดในการสร้างเอกสาร PDF: ' + error.message
        });
    }
});

// --- LINE Bot Event Handlers ---
async function handleFollowEvent(userId, replyToken) {
    console.log(`➕ User ${userId} followed the bot.`);
    const welcomeMessage = createWelcomeFlexMessage();
    await lineService.replyToUser(replyToken, [welcomeMessage]);
}

async function handleMessageEvent(userId, message, replyToken) {
    if (message.type === 'text') {
        const userText = message.text.trim();
        await processUserText(userId, userText, replyToken);
    } else {
        await lineService.replyToUser(replyToken, 'ขออภัยครับ ระบบรองรับเฉพาะข้อความเท่านั้น');
    }
}

async function handlePostbackEvent(userId, postback, replyToken) {
    const postbackData = postback.data;
    await processUserText(userId, postbackData, replyToken);
}

async function processUserText(userId, text, replyToken) {
    const lowerText = text.toLowerCase();
    const currentState = getUserState(userId);
    let currentData = getUserData(userId);

    if (lowerText === 'ยกเลิก' || lowerText === 'cancel') {
        clearUserStateAndData(userId);
        await lineService.replyToUser(replyToken, '🔄 การดำเนินการปัจจุบันถูกยกเลิกแล้วครับ\nหากต้องการเริ่มใหม่ กรุณาเลือกจากเมนูหลัก');
        const welcomeMessage = createWelcomeFlexMessage();
        await lineService.pushMessage(userId, [welcomeMessage]);
        return;
    }

    // Handle tracking states
    if (currentState === config.STATES.AWAITING_TRACKING_METHOD) {
        if (lowerText === 'ติดตามด้วยเลขที่') {
            setUserState(userId, config.STATES.AWAITING_REQUEST_ID);
            await lineService.replyToUser(replyToken, '🎫 กรุณาระบุเลขที่การแจ้งซ่อม\n(ตัวอย่าง: REQ-20241201-1430-1234)\n\nหรือพิมพ์ "ยกเลิก" เพื่อกลับเมนูหลัก');
        } else if (lowerText === 'ติดตามด้วยเบอร์โทร') {
            setUserState(userId, config.STATES.AWAITING_PHONE_NUMBER);
            await lineService.replyToUser(replyToken, '📱 กรุณาระบุเบอร์โทรศัพท์ที่ใช้แจ้งซ่อม\n(ตัวอย่าง: 0812345678)\n\nหรือพิมพ์ "ยกเลิก" เพื่อกลับเมนูหลัก');
        } else {
            await lineService.replyToUser(replyToken, '❌ กรุณาเลือกวิธีติดตามที่ถูกต้อง');
        }
        return;
    }

    if (currentState === config.STATES.AWAITING_REQUEST_ID) {
        const requestId = text.trim();
        try {
            const request = await googleSheetsService.findRepairRequestById(requestId);
            if (request) {
                const resultMessage = createTrackingResultFlexMessage([request]);
                await lineService.replyToUser(replyToken, [resultMessage]);
            } else {
                const notFoundMessage = createTrackingResultFlexMessage([]);
                await lineService.replyToUser(replyToken, [notFoundMessage]);
            }
            clearUserStateAndData(userId);
        } catch (error) {
            console.error('Error searching by request ID:', error);
            await lineService.replyToUser(replyToken, '❌ เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง');
        }
        return;
    }

    if (currentState === config.STATES.AWAITING_PHONE_NUMBER) {
        const phoneNumber = text.trim();
        if (!/^[0-9]{9,10}$/.test(phoneNumber)) {
            await lineService.replyToUser(replyToken, '❌ รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง\nกรุณาใส่เบอร์โทรศัพท์ 9-10 หลัก');
            return;
        }
        
        try {
            const requests = await googleSheetsService.findRepairRequestsByPhone(phoneNumber);
            const resultMessage = createTrackingResultFlexMessage(requests);
            await lineService.replyToUser(replyToken, [resultMessage]);
            clearUserStateAndData(userId);
        } catch (error) {
            console.error('Error searching by phone number:', error);
            await lineService.replyToUser(replyToken, '❌ เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง');
        }
        return;
    }

    if (lowerText === 'ติดตามการซ่อม' || lowerText === 'ติดตาม') {
        await initiateTrackingProcess(userId, replyToken);
        return;
    }

    switch (currentState) {
        case config.STATES.NONE:
            if (lowerText === 'แจ้งซ่อม' || lowerText === 'แจ้งปัญหา' || lowerText === 'เริ่มแจ้งซ่อม') {
                await initiateRepairProcess(userId, replyToken);
            } else {
                const welcomeMessage = createWelcomeFlexMessage();
                await lineService.replyToUser(replyToken, [welcomeMessage]);
            }
            break;

        case config.STATES.AWAITING_FORM_COMPLETION:
            if (lowerText === 'แจ้งซ่อม' || lowerText === 'แจ้งปัญหา') {
                await initiateRepairProcess(userId, replyToken);
            } else {
                await lineService.replyToUser(replyToken, '📝 กรุณากรอกข้อมูลในฟอร์มที่ส่งให้ก่อนครับ\nหรือพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่');
            }
            break;

        case config.STATES.AWAITING_USER_DATA_CONFIRMATION:
            if (lowerText === 'ยืนยันข้อมูล') {
                currentData.personalInfoConfirmed = true;
                setUserData(userId, currentData);
                const savedToSheet = await googleSheetsService.saveOrUpdateUserPersonalDetails(userId, currentData);
                if (savedToSheet) {
                    clearUserStateAndData(userId);
                    const repairFormMessage = createRepairFormFlexMessage(userId);
                    await lineService.pushMessage(userId, `✅ ข้อมูลของท่านได้รับการยืนยันและบันทึกแล้วครับ\n\n📝 ต่อไปกรุณากรอกแบบฟอร์มแจ้งซ่อม`);
                    await lineService.pushMessage(userId, [repairFormMessage]);
                } else {
                    await lineService.replyToUser(replyToken, `❌ ขออภัยครับ เกิดข้อผิดพลาดในการบันทึกข้อมูล\nกรุณาลองใหม่อีกครั้ง หรือติดต่อเจ้าหน้าที่`);
                    clearUserStateAndData(userId);
                }
            } else if (lowerText === 'แก้ไขข้อมูล') {
                const personalFormMessage = createPersonalInfoFormFlexMessage(userId);
                await lineService.replyToUser(replyToken, [personalFormMessage]);
                setUserState(userId, config.STATES.AWAITING_FORM_COMPLETION);
            } else {
                await lineService.replyToUser(replyToken, '❓ กรุณาเลือกจากตัวเลือกที่ให้ไว้\n"ยืนยันข้อมูล", "แก้ไขข้อมูล" หรือ "ยกเลิก"');
            }
            break;

        default:
            const welcomeMessage = createWelcomeFlexMessage();
            await lineService.replyToUser(replyToken, [welcomeMessage]);
            break;
    }
}

async function initiateRepairProcess(userId, replyToken) {
    clearUserStateAndData(userId);
    
    // เช็คว่ามีข้อมูลส่วนตัวหรือยัง
    const existingDetails = await googleSheetsService.getUserPersonalDetails(userId);
    
    if (existingDetails && existingDetails.firstName) {
        // มีข้อมูลแล้ว -> แสดงข้อมูลให้ยืนยันก่อนไปฟอร์มแจ้งซ่อม
        setUserData(userId, { ...existingDetails, personalInfoConfirmed: false });
        setUserState(userId, config.STATES.AWAITING_USER_DATA_CONFIRMATION);
        
        const confirmationMessage = createPersonalInfoConfirmationFlexMessage(existingDetails);
        await lineService.replyToUser(replyToken, [confirmationMessage]);
    } else {
        // ยังไม่มีข้อมูล -> ให้กรอกข้อมูลส่วนตัวก่อน
        const personalFormMessage = createPersonalInfoFormFlexMessage(userId);
        await lineService.replyToUser(replyToken, [personalFormMessage]);
        setUserState(userId, config.STATES.AWAITING_FORM_COMPLETION);
    }
}

async function initiateTrackingProcess(userId, replyToken) {
    clearUserStateAndData(userId);
    setUserState(userId, config.STATES.AWAITING_TRACKING_METHOD);
    
    const trackingMessage = createTrackingMethodFlexMessage();
    await lineService.replyToUser(replyToken, [trackingMessage]);
}

// --- Admin Dashboard HTML Routes ---
app.get('/admin/smart-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin_dashboard', 'smart-login.html'));
});
app.get('/admin/login', (req, res) => { res.redirect('/admin/smart-login.html'); });
app.get('/admin/dashboard', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'dashboard.html')); });
app.get('/admin/executive-dashboard', authenticateAdminToken, (req, res) => {
    if (req.user && (req.user.role === 'executive' || req.user.role === 'admin')) {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'executive-dashboard.html'));
    } else { res.status(403).send('Access Denied. Only for Executives or Admins.'); }
});
app.get('/admin/requests', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'requests.html')); });
app.get('/admin/request-details', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'request-details.html')); });
app.get('/admin/poles', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'poles.html')); });
app.get('/admin/pole-form', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'pole-form.html')); });
app.get('/admin/inventory', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'inventory.html')); });
app.get('/admin/users', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'users.html')); });
app.get('/admin/user-form', authenticateAdminToken, (req, res) => { res.sendFile(path.join(__dirname, 'admin_dashboard', 'user-form.html')); });

// Mobile Apps (with auth and role checking)
app.get('/admin/mobile-executive.html', authenticateAdminToken, (req, res) => {
    if (req.user && (req.user.role === 'executive' || req.user.role === 'admin')) {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'mobile-executive.html'));
    } else { res.status(403).send('Access Denied. Only for Executives or Admins.'); }
});
app.get('/admin/mobile-admin.html', authenticateAdminToken, (req, res) => {
    if (req.user && req.user.role === 'admin') {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'mobile-admin.html'));
    } else { res.status(403).send('Access Denied. Only for Admins.'); }
});
app.get('/admin/mobile-technician.html', authenticateAdminToken, (req, res) => {
    if (req.user && (req.user.role === 'technician' || req.user.role === 'admin')) {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'mobile-technician.html'));
    } else { res.status(403).send('Access Denied. Only for Technicians or Admins.'); }
});
app.get('/admin/mobile-executive', authenticateAdminToken, (req, res) => {
    if (req.user && (req.user.role === 'executive' || req.user.role === 'admin')) {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'mobile-executive.html'));
    } else { res.status(403).send('Access Denied. Only for Executives or Admins.'); }
});
app.get('/admin/mobile-technician', authenticateAdminToken, (req, res) => {
    if (req.user && (req.user.role === 'technician' || req.user.role === 'admin')) {
        res.sendFile(path.join(__dirname, 'admin_dashboard', 'mobile-technician.html'));
    } else { res.status(403).send('Access Denied. Only for Technicians or Admins.'); }
});
app.get('/admin', (req, res) => { res.redirect('/admin/smart-login.html'); });

// --- Server Health Check and Final Error Handling ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
    if (!res.headersSent) {
        res.status(404).json({ status: 'error', message: 'Route not found or not handled' });
    }
});

app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err.stack || err.message || err);
    if (!res.headersSent) {
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// เพิ่มในส่วนการปิด server
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down server...');
    try {
        if (pdfService && typeof pdfService.closeBrowser === 'function') {
            await pdfService.closeBrowser();
        }
    } catch (error) {
        console.error('Error closing PDF service:', error);
    }
    console.log('👋 Server shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down server...');
    try {
        if (pdfService && typeof pdfService.closeBrowser === 'function') {
            await pdfService.closeBrowser();
        }
    } catch (error) {
        console.error('Error closing PDF service:', error);
    }
    console.log('👋 Server shutdown complete');
    process.exit(0);
});

// เพิ่มใน server.js
app.get('/api/health', async (req, res) => {
    try {
        // ตรวจสอบ Google Sheets connection
        await googleSheetsService.authenticate();
        
        // ตรวจสอบ PDF service (แต่ไม่ fail ถ้าไม่มี)
        let pdfHealth = { status: 'unavailable' };
        if (pdfService && typeof pdfService.healthCheck === 'function') {
            try {
                pdfHealth = await pdfService.healthCheck();
            } catch (pdfError) {
                pdfHealth = { status: 'error', message: pdfError.message };
            }
        }
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                googleSheets: 'connected',
                pdfService: pdfHealth.status
            },
            message: pdfHealth.status === 'unavailable' ? 'PDF features disabled but system operational' : 'All services operational'
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// --- Start Server ---
const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT} in ${config.NODE_ENV} mode.`);
  console.log(`🔗 LINE Webhook URL: ${config.BASE_URL}/webhook`);
  console.log(`📝 Personal Info Form URL: ${config.BASE_URL}/form?userId=TEST_USER_ID`);
  console.log(`🔧 Repair Form URL: ${config.BASE_URL}/repair-form.html?userId=TEST_USER_ID`);
  console.log(`📱 React App (Mobile Admin): ${config.BASE_URL}/mobile`);
  console.log(`🔑 Admin Login (HTML): ${config.BASE_URL}/admin/login`);
  console.log(`👑 Executive Dashboard (HTML): ${config.BASE_URL}/admin/executive-dashboard`);
});

module.exports = app;