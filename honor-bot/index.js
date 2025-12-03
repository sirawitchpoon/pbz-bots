require('dotenv').config({ path: '../.env' });
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const express = require('express'); // 1. เรียก Express
const cors = require('cors');       // 2. เรียก CORS

const prisma = new PrismaClient();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// --- ส่วนของ WEB API (Express) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());        // อนุญาตให้เว็บอื่นยิงเข้ามาได้
app.use(express.json()); // อ่าน JSON จาก Body ได้

// ✅ เพิ่มบรรทัดนี้: บอกว่าถ้าคนเข้าเว็บมาเฉยๆ ให้ไปหาไฟล์ในโฟลเดอร์ public
app.use(express.static('public'));

// API: ดึงข้อมูล User ทั้งหมด (เรียงตามแต้มมากสุด)
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { points: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// API: เพิ่มของรางวัลใหม่ (Admin)
app.post('/api/items', async (req, res) => {
    const { name, cost, description } = req.body;
    try {
        const newItem = await prisma.item.create({
            data: {
                name,
                cost: parseInt(cost),
                description
            }
        });
        res.json(newItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to create item" });
    }
});

// ✅ เพิ่มอันนี้: API ดึงรายชื่อของรางวัลทั้งหมด
app.get('/api/items', async (req, res) => {
    try {
        const items = await prisma.item.findMany({
            orderBy: { id: 'asc' } // เรียงตาม ID
        });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch items" });
    }
});

// เริ่มรัน Server
app.listen(PORT, () => {
    console.log(`🌐 API Server running at http://localhost:${PORT}`);
});


// --- ส่วนของ DISCORD BOT (Logic เดิม) ---
client.once('ready', () => {
    console.log(`🗡️  Honor Bot is Online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ✅ ของใหม่: ถ้าไม่ใช่คำสั่ง (!) ค่อยแจกแต้ม
    if (!message.content.startsWith('!')) {
        try {
            await prisma.user.upsert({
                where: { id: message.author.id },
                update: {
                    points: { increment: 1 },
                    username: message.author.username
                },
                create: {
                    id: message.author.id,
                    username: message.author.username,
                    points: 1
                }
            });
        } catch (error) {
            console.error("Error updating DB:", error);
        }
    }

    if (message.content.toLowerCase() === '!honor') {
        const user = await prisma.user.findUnique({
            where: { id: message.author.id }
        });
        await message.reply(`🥷 **${message.author.username}**, you have **${user?.points || 0}** souls.`);
    }

    // --- คำสั่งดูรายการของรางวัล (!shop) ---
    if (message.content.toLowerCase() === '!shop') {
        try {
            // 1. ดึงของรางวัลจาก DB (เอาเฉพาะที่ Active)
            const items = await prisma.item.findMany({
                where: { isActive: true },
                orderBy: { cost: 'asc' } // เรียงตามราคาถูกไปแพง
            });

            if (items.length === 0) {
                return message.reply("🎒 The Order's supply is currently empty.");
            }

            // 2. สร้าง Embed (การ์ด)
            const shopEmbed = new EmbedBuilder()
                .setColor(0xff4d4d) // สีแดงธีม Phantom Blade
                .setTitle('🎒 The Order\'s Exchange Registry')
                .setDescription('Redeem your accumulated **Souls** for these rewards.')
                .setTimestamp()
                .setFooter({ text: 'Use !buy <Item ID> to redeem (Coming Soon)' });

            // 3. วนลูปเอาข้อมูลสินค้าใส่ลงในการ์ด
            items.forEach(item => {
                const stockMsg = item.stock === -1 ? 'unlimited' : `${item.stock} left`;
                // ใส่ [ ] ครอบ Object ไว้ เพื่อบอกว่าเป็น Array
                shopEmbed.addFields([
                    {
                        name: `📦 ${item.name} (ID: ${item.id})`,
                        value: `💰 **${item.cost}** Souls\n📝 ${item.description || '-'}\nstock: ${stockMsg}`,
                        inline: true
                    }
                ]);
            });

            // 4. ส่งกลับไปในห้องแชท
            await message.channel.send({ embeds: [shopEmbed] });

        } catch (error) {
            console.error("Error fetching shop:", error);
            await message.reply("Failed to open the shop registry.");
        }
    }

    // --- คำสั่งซื้อของ (!buy <Item_ID>) ---
    // เช็คด้วย startsWith เพราะต้องมี ID ต่อท้าย
    if (message.content.toLowerCase().startsWith('!buy')) {
        const args = message.content.split(' ');
        const itemId = parseInt(args[1]);

        // 1. เช็คว่าใส่เลข ID มาไหม
        if (isNaN(itemId)) {
            return message.reply("⚠️ Usage: `!buy <Item ID>` (Check Item ID from !shop command)");
        }

        try {
            // 2. ดึงข้อมูล User และ Item มารอไว้
            const user = await prisma.user.findUnique({ where: { id: message.author.id } });
            const item = await prisma.item.findUnique({ where: { id: itemId } });

            // 3. Validation Checks (ดัก Error ต่างๆ)
            if (!item || !item.isActive) {
                return message.reply("❌ Item not found or unavailable.");
            }
            if (item.stock === 0) {
                return message.reply("❌ This item is Out of Stock!");
            }
            if (user.points < item.cost) {
                return message.reply(`❌ Not enough souls! You need **${item.cost}** but have only **${user.points}**.`);
            }

            // 4. เริ่ม Transaction (ตัดแต้ม + ลดของ + เก็บประวัติ) 
            // *สำคัญมาก* ต้องทำพร้อมกัน ถ้าพังต้อง Rollback หมด
            await prisma.$transaction(async (tx) => {
                // A. ตัดแต้มคนซื้อ
                await tx.user.update({
                    where: { id: user.id },
                    data: { points: { decrement: item.cost } }
                });

                // B. ลดสต็อก (ถ้าไม่ใช่ -1)
                if (item.stock !== -1) {
                    await tx.item.update({
                        where: { id: item.id },
                        data: { stock: { decrement: 1 } }
                    });
                }

                // C. บันทึกประวัติการแลก (Redemption Log)
                await tx.redemption.create({
                    data: {
                        userId: user.id,
                        itemId: item.id,
                        cost: item.cost
                    }
                });
            });

            // 5. แจ้งผลสำเร็จ
            await message.reply(`✅ **Deal Sealed!** You have redeemed **${item.name}** for ${item.cost} souls.`);
            console.log(`User ${user.username} redeemed ${item.name}`);

        } catch (error) {
            console.error("Buy Error:", error);
            await message.reply("❌ An error occurred while processing the transaction.");
        }
    }

});

client.login(process.env.HONOR_BOT_TOKEN);