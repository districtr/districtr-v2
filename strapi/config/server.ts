export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  // url: "http://localhost:3000/admin", // Ensures correct admin URL
  admin: {
    auth: {
      secret: env("ADMIN_JWT_SECRET", "your-secret-key"),
    },
    // url: "/admin", // Sets correct path
  },
  settings: {
    cors: {
      enabled: true,
      origin: ["http://localhost:3000"], // Allow requests from Next.js
    },
  },
});


