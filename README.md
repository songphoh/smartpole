# LINE Bot แจ้งซ่อมไฟฟ้า อบต.ข่าใหญ่ (เวอร์ชันพื้นฐาน)

ระบบ LINE Bot สำหรับรับแจ้งซ่อมไฟฟ้าเบื้องต้น พร้อมระบบฟอร์มสำหรับกรอกข้อมูลผู้แจ้ง และบันทึกข้อมูลลง Google Sheets

## ภาพรวมระบบ

ผู้ใช้สามารถแจ้งปัญหาผ่าน LINE Bot โดยระบบจะแนะนำให้กรอกข้อมูลส่วนตัวผ่านเว็บฟอร์ม จากนั้นผู้ใช้จะแจ้งรายละเอียดปัญหา (รหัสเสา, สาเหตุ, รูปภาพ) ผ่าน LINE Bot และระบบจะบันทึกข้อมูลการแจ้งซ่อมลงใน Google Sheets

## คุณสมบัติหลัก

* **แจ้งซ่อมผ่าน LINE**: ผู้ใช้สามารถเริ่มต้นกระบวนการแจ้งซ่อมผ่าน LINE OA
* **ฟอร์มข้อมูลผู้แจ้ง**: หน้าเว็บฟอร์มสำหรับให้ผู้ใช้กรอกข้อมูลส่วนตัว (ชื่อ, เบอร์โทร, ที่อยู่)
* **บันทึกข้อมูลลง Google Sheets**:
    * ข้อมูลส่วนตัวผู้แจ้ง (จากฟอร์ม)
    * ข้อมูลการแจ้งซ่อม (จาก LINE Bot)
* **ขั้นตอนการแจ้งซ่อม**:
    1.  ผู้ใช้พิมพ์ "แจ้งซ่อม"
    2.  ระบบส่งลิงก์ฟอร์มข้อมูลผู้แจ้ง
    3.  ผู้ใช้กรอกฟอร์ม
    4.  ระบบยืนยันการบันทึกข้อมูลส่วนตัว
    5.  ผู้ใช้แจ้งรหัสเสาไฟฟ้า
    6.  ผู้ใช้แจ้งสาเหตุ/ลักษณะปัญหา
    7.  ผู้ใช้เลือกส่ง/ไม่ส่งรูปภาพประกอบ
    8.  ผู้ใช้ยืนยันข้อมูลการแจ้งซ่อมทั้งหมด
    9.  ระบบบันทึกการแจ้งซ่อมและแจ้งเลขที่การแจ้งซ่อมให้ผู้ใช้ทราบ

## โครงสร้างโปรเจกต์



|── admin_dashboard/
|   ├── dashboard.html
│   ├── executive-dashboard.html
│   ├── inventory.html
│   ├── login.html
│   ├── pole-form.html
│   ├── poles.html
│   ├── request-details.html
│   ├── requests.html
│   ├── suer-form.html
│   ├── suers.html    
├── config/
│   └── config.js           # ไฟล์ตั้งค่ากลางของระบบ
├── public/
│   └── form.html           # หน้าเว็บฟอร์มสำหรับกรอกข้อมูล
├── services/
│   ├── googleSheets.js     # โมดูลสำหรับจัดการ Google Sheets
│   └── lineService.js        # โมดูลสำหรับจัดการ LINE API
├── .env.example            # ตัวอย่างไฟล์ Environment Variables
├── .gitignore              # ไฟล์ที่ Git จะไม่ติดตาม
├── package.json            # ข้อมูลโปรเจกต์และ Dependencies
├── server.js               # ไฟล์หลักของเซิร์ฟเวอร์ (Express.js)
└── README.md               # ไฟล์นี้


## การติดตั้งและเริ่มต้นใช้งาน

**สิ่งที่ต้องมี:**

1.  **Node.js** (เวอร์ชัน 18.x ขึ้นไป)
2.  **npm** (มาพร้อมกับ Node.js)
3.  **บัญชี LINE Developers**: สำหรับสร้าง Messaging API Channel
4.  **บัญชี Google Cloud Platform**: สำหรับสร้าง Service Account และใช้งาน Google Sheets API
5.  **Google Sheet**: สำหรับเก็บข้อมูล

**ขั้นตอนการติดตั้ง:**

1.  **Clone Repository (ถ้ามี) หรือสร้างโปรเจกต์:**
    ```bash
    # mkdir line-repair-bot
    # cd line-repair-bot
    # npm init -y (ถ้าสร้างใหม่)
    ```

2.  **คัดลอกไฟล์ทั้งหมด** ที่ได้สร้างไว้ลงในโปรเจกต์ของคุณ

3.  **ติดตั้ง Dependencies:**
    ```bash
    npm install
    ```

4.  **ตั้งค่า Environment Variables:**
    * คัดลอกไฟล์ `.env.example` แล้วเปลี่ยนชื่อเป็น `.env`
    * แก้ไขค่าในไฟล์ `.env` ให้ถูกต้อง:
        * `LINE_CHANNEL_ACCESS_TOKEN`: จาก LINE Developers Console
        * `GOOGLE_SERVICE_ACCOUNT_EMAIL`: อีเมลของ Service Account
        * `GOOGLE_PRIVATE_KEY`: Private Key จากไฟล์ JSON ของ Service Account (คัดลอกทั้งหมดยกเว้น `-----BEGIN PRIVATE KEY-----` และ `-----END PRIVATE KEY-----` แล้วใส่ `\n` แทนการขึ้นบรรทัดใหม่จริง)
        * `SPREADSHEET_ID`: ID ของ Google Sheet ที่คุณสร้างไว้
        * `PORT`: (เช่น 3000)
        * `NODE_ENV`: `development` หรือ `production`
        * `APP_BASE_URL`: URL หลักของแอปพลิเคชันคุณ (สำคัญมากสำหรับลิงก์ฟอร์ม)
            * **Development (Local):** เช่น `http://localhost:3000`
            * **Production (เช่น Render, Heroku):** เช่น `https://your-app-name.onrender.com`
        * `TZ`: `Asia/Bangkok`

5.  **ตั้งค่า LINE Developers Console:**
    * ไปที่ Channel ของคุณ > "Messaging API" settings
    * ตั้งค่า **Webhook URL** เป็น `YOUR_APP_BASE_URL/webhook` (เช่น `https://your-app-name.onrender.com/webhook`)
    * เปิดใช้งาน "Use webhook"
    * ปิด "Auto-reply messages" และ "Greeting messages" (เพื่อให้ Bot จัดการเอง)

6.  **ตั้งค่า Google Sheets:**
    * สร้าง Google Sheet ใหม่
    * คัดลอก Spreadsheet ID จาก URL ของชีต (ใส่ใน `.env`)
    * แชร์ชีตนี้ให้กับ **Service Account Email** (จาก `.env`) โดยให้สิทธิ์เป็น **Editor**
    * ระบบจะสร้างชีตย่อยชื่อ `LineID` และ `แจ้งเหตุไฟฟ้าขัดข้อง` พร้อมหัวตารางให้โดยอัตโนมัติเมื่อมีการใช้งานครั้งแรก

7.  **รันเซิร์ฟเวอร์:**
    * **Development Mode (ใช้ `nodemon` สำหรับ auto-reload):**
        ```bash
        npm run dev
        ```
    * **Production Mode:**
        ```bash
        npm start
        ```

8.  **ทดสอบการใช้งาน:**
    * เพิ่ม LINE Bot ของคุณเป็นเพื่อน
    * พิมพ์ "แจ้งซ่อม" เพื่อเริ่มกระบวนการ

## การ Deploy (ตัวอย่าง Render.com - แนะนำสำหรับ Free Tier)

1.  **Push โค้ดของคุณขึ้น GitHub Repository**
2.  **สร้างบัญชีที่ Render.com**
3.  **สร้าง "New Web Service"** และเชื่อมต่อกับ GitHub Repository ของคุณ
4.  **ตั้งค่า Environment:**
    * **Runtime:** `Node`
    * **Build Command:** `npm install`
    * **Start Command:** `npm start`
5.  **ตั้งค่า Environment Variables ในหน้า Dashboard ของ Render** (เหมือนกับในไฟล์ `.env`)
    * **สำคัญ:** `APP_BASE_URL` ต้องเป็น URL ที่ Render ให้มา (เช่น `https://your-app-name.onrender.com`)
6.  **Deploy!**
7.  **อัปเดต Webhook URL ใน LINE Developers Console** ให้เป็น URL ของ Render

## หมายเหตุ

* ระบบนี้ใช้ In-memory storage (`Map`) สำหรับเก็บ `userStates` และ `userDataStore` ซึ่งหมายความว่าข้อมูลสถานะการสนทนาจะหายไปเมื่อเซิร์ฟเวอร์รีสตาร์ท สำหรับเวอร์ชัน Production ที่ต้องการความเสถียรมากขึ้น ควรพิจารณาใช้ฐานข้อมูลภายนอกเช่น Redis หรือ Firestore
* การจัดการข้อผิดพลาดและ Security ยังเป็นแบบพื้นฐาน สามารถปรับปรุงเพิ่มเติมได้ตามความต้องการ

