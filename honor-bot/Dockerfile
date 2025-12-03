FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# ⚠️ แก้ไข: ลบ --production ออกเพื่อให้มี Prisma CLI ไว้รันคำสั่ง generate/migrate
RUN npm install

# Copy source code
COPY . .

# ✅ เพิ่ม: สั่ง Gen Client ตอน Build Image
RUN npx prisma generate

# เปลี่ยน command ให้ migrate DB ก่อนรันบอทเสมอ
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]