FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# ลบ --production ออกเพื่อให้มี Prisma CLI
RUN npm install

# Copy source code
COPY . .

# ✅ เพิ่มบรรทัดนี้: ใส่ค่าหลอกๆ ให้ Prisma เห็นตอน Build (จะได้ไม่งอแง)
ENV DATABASE_URL="file:./dev.db"

# สั่ง Gen Client
RUN npx prisma generate

# เปลี่ยน command ให้ migrate DB ก่อนรันบอทเสมอ
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]