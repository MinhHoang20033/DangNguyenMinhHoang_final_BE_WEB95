export const getBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;
