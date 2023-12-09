const { Payment, Registration } = require("../../models");
const {
  successResponse,
  errorResponse,
  formatToMoment,
} = require("../../helpers");
const sequelize = require("../../config/sequelize");

// Sub function
const formatPayment = (payment) => {
  const formattedPayment = {
    ...payment.toJSON(),
    createdAt: formatToMoment(payment.createdAt),
    updatedAt: formatToMoment(payment.updatedAt),
  };
  return formattedPayment;
};

// Main function
const processPayment = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { paymentMethod, registrationId, amount } = req.body;
    if (!registrationId || !amount) {
      return errorResponse(
        req,
        res,
        "registrationId and amount are required",
        400
      );
    }

    // Check if the registration is already completed
    const registration = await Registration.findByPk(registrationId);
    // Registration is already completed, do not allow new payment
    if (registration.registrationStatus === "active") {
      return errorResponse(req, res, "Registration is already completed", 400);
    }

    // Set feeId appropriately based on the amount for now
    let feeId = null;
    if (amount === 300000) {
      feeId = 1; // Set the appropriate feeId based on the amount
    }

    // Create a payment associated with the current user's registration
    const newPayment = await Payment.create(
      {
        amount,
        paymentDate: new Date().toISOString(),
        status: "success", // Assuming it's successful since it's a third-party payment
        paymentMethod,
        registrationId,
      },
      { transaction: t }
    );

    registration.registrationStatus = "paid";
    await registration.save({ transaction: t });
    await t.commit();

    const formattedPayment = formatPayment(newPayment);
    return successResponse(req, res, { payment: formattedPayment }, 200);
  } catch (error) {
    console.error(error);

    // Rollback the transaction in case of an error
    await t.rollback();

    // Handle errors
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

module.exports = {
  processPayment,
};
