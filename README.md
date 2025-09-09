# ระบบแจ้งซ่อมไฟฟ้า อบต.ข่าใหญ่ v2.0

ระบบ LINE Bot สำหรับรับแจ้งซ่อมไฟฟ้าแบบครบวงจร พร้อมระบบจัดการแบบ All-in-One สำหรับผู้บริหาร เจ้าหน้าที่ และช่างเทคนิค

## 🌟 ภาพรวมระบบ

**สำหรับประชาชน:**
- แจ้งซ่อมผ่าน LINE Bot แบบ Conversational UI
- กรอกข้อมูลผ่านเว็บฟอร์มที่ใช้งานง่าย
- ติดตามสถานะการซ่อมแบบ Real-time
- รับการแจ้งเตือนผ่าน LINE เมื่อสถานะเปลี่ยน

**สำหรับเจ้าหน้าที่:**
- ระบบ Admin Dashboard แบบ Responsive
- Mobile Apps สำหรับงานในสนาม
- ระบบรายงาน PDF แบบครบถ้วน
- การแจ้งเตือนผ่าน Telegram

## 🚀 คุณสมบัติหลัก

### 👥 สำหรับประชาชน (LINE Bot)
- **แจ้งซ่อมผ่าน LINE**: ใช้ Flex Messages และ Rich Menus
- **ฟอร์มข้อมูลผู้แจ้ง**: กรอกข้อมูลส่วนตัวผ่านเว็บ
- **ฟอร์มแจ้งซ่อม**: แจ้งปัญหาพร้อมรูปภาพและพิกัด GPS
- **ติดตามสถานะ**: ค้นหาด้วยเลขที่หรือเบอร์โทร
- **Flex Messages**: UI ที่สวยงามและใช้งานง่าย

### 🏢 สำหรับผู้บริหาร (Executive Dashboard)
- **Dashboard ภาพรวม**: สถิติและกราฟแบบ Real-time
- **อนุมัติคำขอ**: พร้อมระบบลายเซ็นดิจิทัล
- **รายงาน PDF**: ส่งออกรายงานเป็น PDF
- **Mobile Executive App**: จัดการผ่านมือถือ

### 👨‍💼 สำหรับเจ้าหน้าที่ (Admin Dashboard)
- **จัดการคำขอซ่อม**: ดู แก้ไข อัปเดตสถานะ
- **จัดการข้อมูลเสาไฟฟ้า**: เพิ่ม แก้ไข ลบข้อมูลเสา
- **จัดการคลังอุปกรณ์**: ติดตามวัสดุและอุปกรณ์
- **จัดการผู้ใช้**: ระบบ User Management แบบ Role-based
- **ระบบรายงาน**: รายงานที่หลากหลายรูปแบบ

### 🔧 สำหรับช่างเทคนิค (Mobile Technician App)
- **รับงานซ่อม**: ดูรายการงานที่ได้รับมอบหมาย
- **อัปเดตสถานะ**: แจ้งความคืบหน้างานซ่อม
- **บันทึกข้อมูล**: เพิ่มหมายเหตุและรูปภาพ
- **แผนที่**: ดูตำแหน่งจุดซ่อมผ่าน GPS

### 📱 ระบบแจ้งเตือน
- **LINE Notifications**: แจ้งเตือนผู้แจ้งเมื่อสถานะเปลี่ยน
- **Telegram Bot**: แจ้งเตือนเจ้าหน้าที่เมื่อมีงานใหม่
- **Email Notifications**: (อุปกรณ์เสริม)

### 📊 ระบบรายงาน
- **PDF Reports**: รายงานคำขอแจ้งซ่อมแบบครบถ้วน
- **Excel Export**: ส่งออกข้อมูลเป็น Excel
- **Dashboard Analytics**: กราฟและสถิติแบบ Interactive

## 🏗️ โครงสร้างโปรเจกต์

```
├── admin_dashboard/              # Admin Dashboard (HTML/CSS/JS)
│   ├── dashboard.html           # หน้าแดชบอร์ดหลัก
│   ├── executive-dashboard.html # หน้าผู้บริหาร
│   ├── requests.html            # จัดการคำขอซ่อม
│   ├── request-details.html     # รายละเอียดคำขอ
│   ├── poles.html              # จัดการเสาไฟฟ้า
│   ├── pole-form.html          # ฟอร์มเสาไฟฟ้า
│   ├── inventory.html          # จัดการคลังอุปกรณ์
│   ├── users.html              # จัดการผู้ใช้
│   ├── user-form.html          # ฟอร์มผู้ใช้
│   ├── smart-login.html        # หน้าเข้าสู่ระบบ
│   ├── mobile-executive.html   # Mobile App ผู้บริหาร
│   ├── mobile-admin.html       # Mobile App เจ้าหน้าที่
│   └── mobile-technician.html  # Mobile App ช่างเทคนิค
├── config/
│   └── config.js               # ไฟล์ตั้งค่ากลาง
├── mobile/                     # React Native App (ถ้ามี)
│   └── build/                  # Build files
├── public/
│   ├── form.html              # ฟอร์มข้อมูลผู้แจ้ง
│   └── repair-form.html       # ฟอร์มแจ้งซ่อม
├── services/
│   ├── googleSheets.js        # Google Sheets API
│   ├── lineService.js         # LINE Messaging API
│   └── pdfService.js          # PDF Generation (Optional)
├── .env.example               # ตัวอย่าง Environment Variables
├── .gitignore
├── package.json
├── server.js                  # Express.js Server
└── README.md
```

## ⚙️ การติดตั้งและเริ่มต้นใช้งาน

### 📋 สิ่งที่ต้องมี

1. **Node.js** (เวอร์ชัน 18.x ขึ้นไป)
2. **npm** (มาพร้อมกับ Node.js)
3. **บัญชี LINE Developers**: สำหรับ Messaging API
4. **บัญชี Google Cloud Platform**: สำหรับ Service Account
5. **Google Sheets**: สำหรับฐานข้อมูล
6. **Telegram Bot** (เลือกใช้): สำหรับแจ้งเตือนเจ้าหน้าที่

### 🔧 ขั้นตอนการติดตั้ง

1. **Clone Repository:**
   ```bash
   git clone https://github.com/your-repo/line-repair-bot
   cd line-repair-bot
   ```

2. **ติดตั้ง Dependencies:**
   ```bash
   npm install
   ```

3. **ตั้งค่า Environment Variables:**
   ```bash
   cp .env.example .env
   # แก้ไขไฟล์ .env ตามความต้องการ
   ```

4. **ตั้งค่าไฟล์ .env:**
   ```env
   # LINE Bot Configuration
   LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
   
   # Google Sheets Configuration
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   SPREADSHEET_ID=your_google_sheet_id
   GOOGLE_DRIVE_SIGNATURE_FOLDER_ID=your_drive_folder_id
   
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   BASE_URL=https://your-domain.com
   TZ=Asia/Bangkok
   
   # Admin Authentication
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   JWT_SECRET=your_very_strong_jwt_secret
   
   # Contact Information (Optional)
   CONTACT_PHONE=02-XXX-XXXX
   CONTACT_EMAIL=info@khaiyai.go.th
   ```

5. **ตั้งค่า Google Sheets:**
   - สร้าง Google Sheet ใหม่
   - แชร์ให้กับ Service Account Email
   - ระบบจะสร้างชีตย่อยอัตโนมัติ:
     - `LineID` - ข้อมูลผู้ใช้
     - `แจ้งเหตุไฟฟ้าขัดข้อง` - คำขอซ่อม
     - `เสาไฟฟ้า` - ข้อมูลเสา
     - `คลังอุปกรณ์` - วัสดุและอุปกรณ์
     - `AdminUsers` - ผู้ดูแลระบบ
     - `การตั้งค่า` - ค่าคอนฟิก

6. **ตั้งค่า LINE Developers:**
   - Webhook URL: `https://your-domain.com/webhook`
   - เปิดใช้งาน "Use webhook"
   - ปิด "Auto-reply" และ "Greeting messages"

7. **รันเซิร์ฟเวอร์:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🌐 การใช้งาน

### 👤 ผู้ใช้ทั่วไป (LINE Bot)

1. **เพิ่มเพื่อน LINE Bot**
2. **พิมพ์ "แจ้งซ่อม"** เพื่อเริ่มต้น
3. **กรอกข้อมูลส่วนตัว** ผ่านเว็บฟอร์ม
4. **กรอกรายละเอียดการแจ้งซ่อม** ผ่าน LINE
5. **ติดตามสถานะ** ด้วยคำสั่ง "ติดตามการซ่อม"

### 👨‍💼 เจ้าหน้าที่ (Admin Dashboard)

1. **เข้าสู่ระบบ**: `https://your-domain.com/admin`
2. **Dashboard หลัก**: ดูสถิติและงานใหม่
3. **จัดการคำขอ**: อัปเดตสถานะและความคืบหน้า
4. **จัดการข้อมูล**: เสาไฟฟ้า, อุปกรณ์, ผู้ใช้

### 👑 ผู้บริหาร (Executive Dashboard)

1. **เข้าสู่ระบบ**: `https://your-domain.com/admin/executive-dashboard`
2. **อนุมัติคำขอ**: พร้อมลายเซ็นดิจิทัล
3. **ดูรายงาน**: สถิติและกราฟแบบ Real-time
4. **ส่งออก PDF**: รายงานสำหรับการประชุม

## 🔐 ระบบผู้ใช้และสิทธิ์

### บทบาทผู้ใช้ (User Roles)

- **Admin**: เข้าถึงได้ทุกฟีเจอร์
- **Executive**: อนุมัติคำขอ, ดูรายงาน
- **Technician**: อัปเดตงานซ่อม, บันทึกความคืบหน้า

### การจัดการผู้ใช้

1. **เพิ่มผู้ใช้ใหม่**: ผ่าน Admin Dashboard
2. **กำหนดสิทธิ์**: ตามบทบาทงาน
3. **เปิด/ปิดการใช้งาน**: ควบคุมการเข้าถึง

## 🛠️ ฟีเจอร์เสริม

### 📱 Telegram Integration

```env
# ตั้งค่าใน Admin Dashboard
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 📄 PDF Generation (Optional)

- ต้องการ Puppeteer (หรือใช้ทางเลือกอื่น)
- หากไม่ติดตั้ง ระบบจะทำงานได้ปกติ (PDF จะไม่พร้อมใช้งาน)

### 🗺️ Google Maps Integration

- แสดงตำแหน่งเสาไฟฟ้าบนแผนที่
- นำทางสำหรับช่างเทคนิค

## 🚀 การ Deploy

### Render.com (แนะนำ)

1. **เชื่อมต่อ GitHub Repository**
2. **ตั้งค่า Build:**
   - Build Command: `npm install`
   - Start Command: `npm start`
3. **เพิ่ม Environment Variables**
4. **Deploy!**

### Railway

1. **เชื่อมต่อ GitHub**
2. **เพิ่ม Environment Variables**
3. **Deploy อัตโนมัติ**

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 API Endpoints

### Public APIs
- `GET /` - Health check
- `POST /webhook` - LINE Bot webhook
- `POST /api/form-submit` - ส่งข้อมูลผู้แจ้ง
- `POST /api/repair-form-submit` - ส่งข้อมูลการแจ้งซ่อม

### Admin APIs (ต้องมี JWT Token)
- `POST /api/admin/login` - เข้าสู่ระบบ
- `GET /api/admin/repair-requests` - ดูคำขอซ่อม
- `PUT /api/admin/repair-request/:id/status` - อัปเดตสถานะ
- `GET /api/admin/dashboard-summary` - ข้อมูลสรุป Dashboard
- `GET /api/admin/poles` - ข้อมูลเสาไฟฟ้า
- `POST /api/admin/inventory` - จัดการคลังอุปกรณ์
- `GET /api/admin/users` - จัดการผู้ใช้
- `POST /api/admin/upload-signature` - อัปโหลดลายเซ็น
- `POST /api/admin/reports/repair-requests/pdf` - สร้างรายงาน PDF

## 🔍 การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

1. **PDF ไม่ทำงาน**: 
   - ระบบจะทำงานปกติ แต่ PDF จะไม่พร้อมใช้งาน
   - ติดตั้ง `puppeteer` หากต้องการใช้ PDF

2. **Google Sheets ไม่อัปเดต**:
   - ตรวจสอบ Service Account permissions
   - ตรวจสอบ SPREADSHEET_ID

3. **LINE Bot ไม่ตอบกลับ**:
   - ตรวจสอบ Webhook URL
   - ตรวจสอบ Channel Access Token

### Logs และ Monitoring

```bash
# ดู logs แบบ real-time
npm run dev

# ตรวจสอบ health
curl https://your-domain.com/api/health
```

## 🔄 การอัปเดต

### เวอร์ชัน 2.0 (ปัจจุบัน)
- ✅ ระบบ Admin Dashboard แบบสมบูรณ์
- ✅ Mobile Apps สำหรับทุกบทบาท
- ✅ ระบบรายงาน PDF
- ✅ Telegram Notifications
- ✅ ระบบลายเซ็นดิจิทัล
- ✅ การจัดการคลังอุปกรณ์
- ✅ ระบบติดตามสถานะแบบ Real-time

### Roadmap
- 🔲 React Native Mobile App
- 🔲 Push Notifications
- 🔲 การจัดการทีมช่าง
- 🔲 ระบบ Calendar Integration
- 🔲 AI Chatbot สำหรับ FAQ

## 🤝 การมีส่วนร่วม

1. Fork repository
2. สร้าง feature branch
3. Commit การเปลี่ยนแปลง
4. สร้าง Pull Request

## 📝 License

This project is licensed under the MIT License.

## 📞 ติดต่อ

- **อีเมล**: -
- **เว็บไซต์**:-
- **LINE Official**: -

---

**ระบบแจ้งซ่อมไฟฟ้า อบต.ข่าใหญ่ v2.0** - ระบบจัดการแบบครบวงจรสำหรับการแจ้งซ่อมไฟฟ้าส่องสว่าง