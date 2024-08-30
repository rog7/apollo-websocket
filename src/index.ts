import { createServer } from "http";
import { Server } from "../node_modules/socket.io/dist/index.js";

const httpServer = createServer();
const io: Server = require("socket.io")(httpServer, {
  cors: {
    origin: "*",
  },
});

interface RoomSettings {
  numberOfChords: number;
  numberOfMinutes: number;
  levelOfDifficulty: string;
  currentChord: number;
  chords: string[];
  hasStarted: boolean;
}

interface User {
  username: string;
  profileImageUrl: string | null;
}

const rooms: Map<string, RoomSettings> = new Map();

try {
  io.on("connection", (socket) => {
    io.fetchSockets().then((values) =>
      console.log("connected sockets", values.length)
    );
    socket.on("set_values", (obj) => {
      socket.data.username = obj.username;
      socket.data.profileImageUrl = obj.profileImageUrl;
      socket.data.score = 0;
    });

    socket.on("create_room", (obj) => {
      const numberOfChords = obj.numberOfChords;
      const numberOfMinutes = obj.numberOfMinutes;
      const levelOfDifficulty = obj.levelOfDifficulty;
      const chords = obj.chords;
      const hasStarted = false;

      const room = generateRandomString(4);
      rooms.set(room, {
        numberOfChords,
        numberOfMinutes,
        levelOfDifficulty,
        currentChord: 1,
        chords,
        hasStarted,
      });

      // Insert user into room
      socket.join(room);

      // Share code with user so that they can share it with friends
      io.to(socket.id).emit("room_created", { code: room });
    });

    // Starts the game
    socket.on("initiate_game", () => {
      const room = Array.from(socket.rooms)[1];

      const settings = rooms.get(room) as RoomSettings;

      settings.hasStarted = true;

      rooms.set(room, settings);

      // This will ensure that the room is closed shortly after the game has ended.
      setInterval(() => {
        io.socketsLeave(room);
        rooms.delete(room);
      }, settings.numberOfMinutes * 60 * 1000 * 1.5);

      io.to(room).emit("start_game", settings);
    });

    // Listener to validate if code to enter room exists
    socket.on("validate_code", async (obj) => {
      const room = rooms.get(obj.code);
      if (room !== undefined) {
        if (!room.hasStarted) {
          socket.join(obj.code);
          io.to(socket.id).emit("validate_code_response", { message: "true" });

          const users = (await io.in(obj.code).fetchSockets()).map((socket) => {
            return {
              username: socket.data.username,
              profileImageUrl: socket.data.profileImageUrl,
              score: socket.data.score,
            } as User;
          });

          // Send event to everyone in the room with updated list
          io.to(obj.code).emit("user_joined", users);
        } else {
          io.to(socket.id).emit("validate_code_response", {
            message: "Game has started",
          });
        }
      } else {
        io.to(socket.id).emit("validate_code_response", {
          message: "Invalid code",
        });
      }
    });

    // Listener when user has answered question correctly
    socket.on("user_answered", (obj) => {
      const room = Array.from(socket.rooms)[1];

      const currentChord = obj.currentChord;

      const currentSettings = rooms.get(room);

      if (currentSettings === undefined) return;

      if (currentSettings.currentChord === currentChord) {
        currentSettings.currentChord += 1;
        rooms.set(room, currentSettings);

        socket.data.score += 1;
        io.to(room).emit("first_to_solve", {
          username: socket.data.username,
          score: socket.data.score,
        });
      }
    });

    socket.on("close_room", () => {
      const room = Array.from(socket.rooms)[1];

      io.in(room).disconnectSockets(true);
      rooms.delete(room);

      io.fetchSockets().then((values) =>
        console.log("connected sockets", values.length)
      );
    });

    socket.conn.on("close", () => {
      io.fetchSockets().then((values) =>
        console.log("connected sockets", values.length)
      );
    });
  });
} catch (e) {
  console.log(e);
}

const generateRandomString = (length: number) => {
  const characters = "0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  if (Array.from(rooms.keys()).includes(result)) {
    generateRandomString(4);
  }

  return result;
};

const port = process.env.NODE_ENV === "development" ? 3001 : 3000;
httpServer.listen(port, () => console.log(`Listening on port ${port}...`));
