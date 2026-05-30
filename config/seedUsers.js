import bcrypt from "bcryptjs";

import User from "../models/User.js";

const DEFAULT_USERS = [
  {
    username: "admin",
    password: "123456",
    role: "admin",
  },
];

export const seedDefaultUsers = async () => {
  await Promise.all(
    DEFAULT_USERS.map(async ({ username, password, role }) => {
      const existingUser = await User.findOne({ username });

      if (!existingUser) {
        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ username, passwordHash, role });
        console.log(`Created default ${role} user (username: ${username})`);
        return;
      }

      if (existingUser.role !== role) {
        existingUser.role = role;
        await existingUser.save();
      }
    }),
  );
};
