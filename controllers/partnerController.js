import Partner from "../models/Partner.js";

const buildPartnerPayload = (body) => ({
  name: body.name || "",
  company: body.company || "",
  email: body.email || "",
  phone: body.phone || "",
});

export const getPartners = async (req, res) => {
  const partners = await Partner.find().sort({ createdAt: -1 });
  res.json(partners);
};

export const createPartner = async (req, res) => {
  const partner = await Partner.create(buildPartnerPayload(req.body));
  res.json(partner);
};

export const updatePartner = async (req, res) => {
  const updated = await Partner.findByIdAndUpdate(req.params.id, buildPartnerPayload(req.body), {
    new: true,
  });
  res.json(updated);
};

export const deletePartner = async (req, res) => {
  await Partner.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
};
