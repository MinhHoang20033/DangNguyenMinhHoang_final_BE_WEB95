import Partner from "../models/Partner.js";
import { notFound } from "../utils/httpError.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const buildPartnerPayload = (body) => ({
  name: body.name || "",
  company: body.company || "",
  email: body.email || "",
  phone: body.phone || "",
});

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE),
  );

  return { page, limit, skip: (page - 1) * limit };
};

const buildPartnerSearchQuery = (search = "") => {
  const keyword = search.trim();
  if (!keyword) {
    return {};
  }

  return {
    $or: [
      { name: { $regex: keyword, $options: "i" } },
      { company: { $regex: keyword, $options: "i" } },
    ],
  };
};

export const getPartners = async (req, res) => {
  const search = req.query.search ?? "";
  const query = buildPartnerSearchQuery(search);
  const { page, limit, skip } = parsePagination(req.query);

  const [partners, total] = await Promise.all([
    Partner.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Partner.countDocuments(query),
  ]);

  res.json({
    items: partners,
    total,
    page,
    limit,
  });
};

export const createPartner = async (req, res) => {
  const partner = await Partner.create(buildPartnerPayload(req.body));
  res.json(partner);
};

export const updatePartner = async (req, res) => {
  const updated = await Partner.findByIdAndUpdate(req.params.id, buildPartnerPayload(req.body), {
    returnDocument: "after",
  });
  if (!updated) {
    throw notFound("Partner not found");
  }
  res.json(updated);
};

export const deletePartner = async (req, res) => {
  const deleted = await Partner.findByIdAndDelete(req.params.id);
  if (!deleted) {
    throw notFound("Partner not found");
  }
  res.json({ message: "Deleted" });
};
