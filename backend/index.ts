import express, { Express, Request, Response } from 'express';
import { PrismaClient } from './generated/prisma';
import cors from 'cors';

const prisma = new PrismaClient();

const app: Express = express();
const PORT: number = 3000;

const corsOptions: cors.CorsOptions = {
  origin: [
    "http://localhost:4200",   // Angular
    "http://localhost:5173",   // Vite
    "http://127.0.0.1:4200",
    "http://127.0.0.1:5173",
    "https://www.linkedin.com"
  ],
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true,                 // only if you send cookies/Authorization
  optionsSuccessStatus: 200,         // some browsers choke on 204
};

app.use(cors(corsOptions));
app.use(express.json());

app.post('/api/connect-requests/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const data = req.body;
  try {
    const connectRequest = await prisma.connectRequest.create({
      data: {
        userId,
        ...data
      }
    });
    res.json(connectRequest);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/connect-requests/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  try {
    const connectRequests = await prisma.connectRequest.findMany({
      where: {
        userId,
      }
    });
    res.json(connectRequests);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  };
});

app.post('/api/direct-messages/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const data = req.body;
  try {
    const connectRequest = await prisma.directMessage.create({
      data: {
        userId,
        ...data
      }
    });
    res.json(connectRequest);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/direct-messages/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  try {
    const connectRequests = await prisma.directMessage.findMany({
      where: {
        userId,
      }
    });
    res.json(connectRequests);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  };
});

app.post('/api/calls/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const { dateBookedFor, recipientName } = req.body;
  try {
    const connectRequest = await prisma.call.create({
      data: {
        userId,
        recipientName,
        dateBookedFor: new Date(dateBookedFor),
      }
    });
    res.json(connectRequest);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/calls/:userId', async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  try {
    const connectRequests = await prisma.call.findMany({
      where: {
        userId,
      }
    });
    res.json(connectRequests);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  };
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
