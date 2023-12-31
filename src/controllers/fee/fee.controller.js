// controllers/feeController.js
const { Fee, FeeHistory } = require("../../models");
const {
  successResponse,
  errorResponse,
  formatToMoment,
} = require("../../helpers");

// Sub function
const formatFee = (fee) => {
  const formattedFee = {
    ...fee.toJSON(),
    createdAt: formatToMoment(fee.createdAt),
    updatedAt: formatToMoment(fee.updatedAt),
  };
  return formattedFee;
};
const createFeeHistory = async (eventType, approvedBy, feeId) => {
  return FeeHistory.create({
    eventType,
    approvedBy,
    feeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};
// Main function
// Create a new fee
const createFee = async (req, res) => {
  try {
    const { feeName, amount, description } = req.body;

    const newFee = await Fee.create({
      feeName,
      amount,
      description,
    });
    await createFeeHistory("created", req.user.fullName, newFee.feeId);
    const formattedFee = formatFee(newFee);
    return successResponse(req, res, { fee: formattedFee }, 201);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Get all fees
const getAllFees = async (req, res) => {
  try {
    const fees = await Fee.findAll();
    if (!fees || fees.length === 0) {
      return successResponse(req, res, "No fees available");
    }
    const formattedFees = fees.map((fee) => formatFee(fee));
    return successResponse(req, res, { fees: formattedFees }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
const getAllFeesWithDeleted = async (req, res) => {
  try {
    const fees = await Fee.unscoped().findAll({
      paranoid: false, //find with fee deleted
    });
    if (!fees || fees.length === 0) {
      return successResponse(req, res, "No fees available");
    }
    const formattedFees = fees.map((fee) => formatFee(fee));
    return successResponse(req, res, { fees: formattedFees }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Get a specific fee by ID
const getFeeById = async (req, res) => {
  try {
    const { feeId } = req.params;
    const fee = await Fee.findByPk(feeId);

    if (!fee) {
      return errorResponse(req, res, "Fee not found", 404);
    }
    const formattedFee = formatFee(fee);
    return successResponse(req, res, { fee: formattedFee }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Update a fee by ID
const updateFeeById = async (req, res) => {
  try {
    const { feeId } = req.params;
    const { feeName, amount, description } = req.body;

    const fee = await Fee.findByPk(feeId);

    if (!fee) {
      return errorResponse(req, res, "Fee not found", 404);
    }

    // Update fee attributes
    fee.feeName = feeName;
    fee.amount = amount;
    fee.description = description;
    fee.feeDate = new Date().toISOString();
    await createFeeHistory(
      `update ${feeName} with ${amount}`,
      req.user.fullName,
      fee.feeId
    );

    await fee.save();
    const formattedFee = formatFee(fee);
    return successResponse(req, res, { fee: formattedFee }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Delete a fee by ID
const deleteFeeById = async (req, res) => {
  try {
    const { feeId } = req.params;
    const fee = await Fee.findByPk(feeId);
    if (!fee) {
      return errorResponse(req, res, "Fee not found", 404);
    }
    // destroy will soft delete bcs we use paranoid
    await fee.destroy();
    await createFeeHistory("deleted", req.user.fullName, fee.feeId);
    return successResponse(req, res, "Fee deleted successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
const getAllResidentFees = async (req, res) => {
  try {
    const fees = await Fee.findAll({ where: { feeName: "resident" } });
    //const fees = await Fee.unscoped().findAll({
    // paranoid: false, //find with fee deleted
    //});
    if (!fees || fees.length === 0) {
      return successResponse(req, res, "No fees available");
    }
    const formattedFees = fees.map((fee) => formatFee(fee));
    return successResponse(req, res, { fees: formattedFees }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

module.exports = {
  createFee,
  getAllFees,
  getFeeById,
  updateFeeById,
  deleteFeeById,
  getAllResidentFees,
  getAllFeesWithDeleted,
};
