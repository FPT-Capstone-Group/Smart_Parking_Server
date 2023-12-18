const {
  Registration,
  Bike,
  Owner,
  Payment,
  RegistrationHistory,
  Fee,
  User,
  Card,
  Notification,
  ParkingType,
} = require("../../models");
const notificationController = require("../notification/notification.controller");
const {
  successResponse,
  errorResponse,
  formatToMoment,
} = require("../../helpers");
const fs = require("fs");
const sequelize = require("../../config/sequelize");
const Op = require("sequelize").Op;
// Sub func
const createRegistrationHistory = async (
  status,
  approvedBy,
  registrationId,
  t
) => {
  return RegistrationHistory.create(
    {
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
      approvedBy,
      registrationId,
    },
    { transaction: t }
  );
};
const createNotification = async (userId, message, notificationType, t) => {
  return Notification.create(
    {
      userId,
      message,
      notificationType,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { transaction: t }
  );
};
const formatRegistration = (registration, amount, username) => {
  const formattedRegistration = {
    ...registration.toJSON(),
    amount,
    username,
    createdAt: formatToMoment(registration.createdAt),
    updatedAt: formatToMoment(registration.updatedAt),
  };

  return formattedRegistration;
};
const createBikeFromRegistration = async (registration, transaction) => {
  return await Bike.create(
    {
      plateNumber: registration.plateNumber,
      model: registration.model,
      manufacture: registration.manufacture,
      registrationNumber: registration.registrationNumber,
      userId: registration.userId,
    },
    { transaction }
  );
};
const createOwnerFromRegistration = async (
  registration,
  bike,
  transaction,
  ownerFaceImage
) => {
  const associatedUser = await User.findByPk(registration.userId);
  return await Owner.create(
    {
      fullName: associatedUser.fullName,
      gender: registration.gender,
      relationship: "owner", // Default to owner when created
      ownerFaceImage,
      bikeId: bike.bikeId,
    },
    { transaction }
  );
};

// Main func

// User create regis
const createRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { plateNumber, model, registrationNumber, manufacture, gender } =
      req.body;

    // Check if the plateNumber already exists in the Bike model redundant but guaranteed
    const existingBike = await Bike.findOne({
      where: { plateNumber },
    });

    if (existingBike) {
      return errorResponse(req, res, "Plate number already exists", 400);
    }

    // Check if there is an existing registration with the same plateNumber and not rejected
    const existingRegistration = await Registration.findOne({
      where: {
        plateNumber,
        status: {
          [Op.notIn]: ["rejected", "canceled", "inactive"],
        },
      },
    });

    if (existingRegistration) {
      return errorResponse(req, res, "Plate number already exists", 400);
    }
    //Check registrationNumber
    const existingRegistrationNumber = await Registration.findOne({
      where: {
        registrationNumber,
        status: {
          [Op.notIn]: ["rejected", "canceled"],
        },
      },
    });
    if (existingRegistrationNumber) {
      return errorResponse(req, res, "Registration number already exists", 400);
    }
    let faceImageBase64 = "";
    if (req.file && req.file.buffer) {
      faceImageBase64 = req.file.buffer.toString("base64");
    } else {
      console.log("No file received or buffer is undefined");
    }

    // Create a new registration
    const newRegistration = await Registration.create(
      {
        status: "created",
        approvedBy: "none",
        plateNumber,
        model,
        registrationNumber,
        manufacture,
        gender,
        faceImage: faceImageBase64,
        userId: req.user.userId,
      },
      { transaction: t }
    );

    // Create Registration History
    await createRegistrationHistory(
      "created",
      "none",
      newRegistration.registrationId,
      t
    );
    // Commit the transaction
    await t.commit();

    // Set the amount to 0 (or the desired value) for the response
    const formattedRegistration = formatRegistration(newRegistration, 0);

    return successResponse(
      req,
      res,
      {
        registration: formattedRegistration,
      },
      201
    );
  } catch (error) {
    console.error(error);
    await t.rollback();
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Admin Verify registration, change status pending to verified,wait to payment....
const verifyRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  let amount = 0;
  try {
    const { registrationId } = req.params;
    // Find the registration by ID
    const registration = await Registration.findByPk(registrationId);

    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }

    // Check if the registration is already verified
    // Need to check more like rejected status,...
    if (registration.status === "verified") {
      return errorResponse(req, res, "Registration is already verified", 400);
    }

    // Update registration status to "verified"
    registration.status = "verified";
    registration.approvedBy = `${req.user.fullName}`;
    await registration.save({ transaction: t });

    // Create Registration History
    await createRegistrationHistory(
      "verified",
      req.user.fullName,
      registrationId,
      t
    );
    const fee = await Fee.findOne({ where: { feeName: "resident" } });
    if (!fee) {
      return errorResponse(req, res, "Resident package not found", 404);
    }
    amount = fee.amount;

    // Send notification
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Verified";
      const notificationBody = "Your registration has been verified.";
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );

      // Save Notification
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    await t.commit();
    const formattedRegistration = formatRegistration(registration, amount);
    return successResponse(
      req,
      res,
      { registration: formattedRegistration },
      200
    );
  } catch (error) {
    console.error(error);
    await t.rollback();
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// User View all their registration
const getAllUserRegistration = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch all registrations for the user
    const userRegistrations = await Registration.findAll({
      where: { userId },
    });

    if (!userRegistrations || userRegistrations.length === 0) {
      return errorResponse(req, res, "Registrations not found", 404);
    }

    // Create a new array to store the formatted registrations
    const formattedRegistrations = [];

    // Iterate through userRegistrations to check each registration
    for (let registration of userRegistrations) {
      let amount = 0;

      if (registration.status === "verified") {
        const residentFee = await Fee.findOne({
          where: { feeName: "resident" },
        });

        if (residentFee) {
          // If a fee with the name "resident" is found, use its amount
          amount = residentFee.amount;
        }

        // Check if there is a successful payment for the current registration
        const successfulPayment = await Payment.findOne({
          where: {
            registrationId: registration.registrationId,
            status: "success",
          },
        });

        if (successfulPayment) {
          // If there is a successful payment, use the payment amount
          amount = successfulPayment.amount;
        }
      }

      // Format each registration and include the amount
      const formattedRegistration = formatRegistration(registration, amount);

      // Push the formatted registration to the new array
      formattedRegistrations.push(formattedRegistration);
    }

    return successResponse(
      req,
      res,
      { registrations: formattedRegistrations },
      200
    );
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// User cancels their registration *** MISSING if user already paid, but want to change bike || Alternative contact admin pernament deactive registration
const cancelRegistration = async (req, res) => {
  try {
    const { registrationId } = req.query;
    const userId = req.user.userId;

    // Find the registration by ID and user ID
    const registration = await Registration.findOne({
      where: { registrationId, userId },
    });

    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }

    // Check if the registration is in a cancellable state
    if (registration.status === "paid" || registration.status === "active") {
      return errorResponse(
        req,
        res,
        "Registration cannot be canceled in paid or active status",
        400
      );
    }

    // Update the registration status to "Canceled"
    registration.status = "canceled";
    await registration.save();

    return successResponse(req, res, {
      message: "Registration canceled successfully",
    });
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin active registration
const activateRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { registrationId } = req.params;
    const { cardId } = req.body;
    const registration = await Registration.findByPk(registrationId);
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }
    if (registration.status !== "paid") {
      return errorResponse(req, res, "Registration is not paid", 404);
    }
    const successfulPayment = await Payment.findOne({
      where: { registrationId, status: "success" },
    });
    if (!successfulPayment) {
      return errorResponse(req, res, "Payment not successful", 400);
    }
    registration.status = "active";

    // Set the expiration date to one month from the current date
    const expiredDate = new Date();
    expiredDate.setMonth(expiredDate.getMonth() + 1);
    registration.expiredDate = expiredDate;

    // Update the approvedBy to the current user's id - Is admin Id since admin is the one who accesses this route
    registration.approvedBy = `${req.user.fullName}`;
    await registration.save({ transaction: t });

    // Create a registration history
    await createRegistrationHistory(
      "active",
      req.user.fullName,
      registration.registrationId,
      t
    );

    // Create owner and bike related to the registration
    const newBike = await createBikeFromRegistration(registration, t);
    const newOwner = await createOwnerFromRegistration(
      registration,
      newBike,
      t,
      registration.faceImage
    );

    const card = await Card.findByPk(cardId);

    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }
    const parkingType = await ParkingType.findOne({
      where: { name: "resident" },
      attributes: ["parkingTypeId"],
    });
    if (card.status === "active") {
      await card.update(
        {
          status: "assigned",
          bikeId: newBike.bikeId,
          parkingTypeId: parkingType.parkingTypeId,
        },
        { transaction: t }
      );
    } else {
      return errorResponse(req, res, "Card is not active", 400);
    }
    //Send Noti
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Activated";
      const notificationBody = "Your registration has been activated.";
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    await t.commit();
    const formattedRegistration = formatRegistration(registration);
    return successResponse(
      req,
      res,
      {
        registration: formattedRegistration,
        bike: newBike.toJSON(),
        owner: newOwner.toJSON(),
      },
      200
    );
  } catch (error) {
    console.error(error);
    await t.rollback();
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Admin tempo deactive a registration
const temporaryDeactivateRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { registrationId } = req.query;
    const registration = await Registration.findByPk(registrationId);
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }
    // Check if the registration is already temporary inactive
    if (registration.status === "temporary_inactive") {
      return errorResponse(
        req,
        res,
        "Registration is already temporary_inactive",
        400
      );
    }
    if (registration.status !== "active" && registration.status !== "expired") {
      return errorResponse(
        req,
        res,
        "Can not deactivate the registration as it is not active",
        400
      );
    }
    // Update the status to "temporary_inactive"
    registration.status = "temporary_inactive";
    await registration.save({ transaction: t });
    // Update Bike also
    const bike = await Bike.findOne({
      where: { plateNumber: registration.plateNumber },
    });

    if (!bike) {
      return errorResponse(req, res, "Bike not found", 404);
    }

    // Set bike status to inactive
    await bike.update({ status: "inactive" }, { transaction: t });
    // Create Registration History
    await createRegistrationHistory(
      "temporary_inactive",
      req.user.fullName,
      registration.registrationId
    );

    // Send notification to user
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Temporary Inactive";
      const notificationBody = `Your registration with plate number: ${registration.plateNumber} is temporary inactive.`;
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    await t.commit();
    return successResponse(req, res, "Disable registration successfully");
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin perma deactivate Registration - status to inactive
const deactivateRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { registrationId } = req.query;
    const registration = await Registration.findByPk(registrationId);
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }
    // Check if the registration is already temporary_inactive
    if (registration.status !== "temporary_inactive") {
      return errorResponse(
        req,
        res,
        "Registration is not temporary_inactive",
        400
      );
    }
    const bike = await Bike.findByPk(registration.bikeId);

    // Check if the bike is found
    if (!bike) {
      await t.rollback();
      return errorResponse(req, res, "Bike not found", 404);
    }
    const card = await Card.findByPk(bike.cardId);
    if (!card) {
      await t.rollback();
      return errorResponse(req, res, "Card not found", 404);
    }
    // reset bike for card
    bike.cardId = null;
    await bike.save({ transaction: t });
    // Update the card status to "inactive", must go retrieve the card
    card.status = "inactive";
    await card.save({ transaction: t });
    // Update the status to "Inactive"
    registration.status = "inactive";
    await registration.save({ transaction: t });
    // Create Registration History
    await createRegistrationHistory(
      "inactive",
      req.user.fullName,
      registration.registrationId
    );

    // Send notification to user
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Deactivated";
      const notificationBody = `Your registration with plate number: ${registration.plateNumber} has been deactivated`;
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    await t.commit();
    return successResponse(req, res, "Deactivated registration successfully");
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin reactivate Registration - tempo inactive to active
const reactivateRegistration = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { registrationId } = req.query;
    const registration = await Registration.findByPk(registrationId);
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }
    // Check if the registration is already active
    if (registration.status === "active") {
      return errorResponse(req, res, "Registration is already active", 400);
    }
    if (registration.status !== "temporary_inactive") {
      return errorResponse(
        req,
        res,
        "Can not reactive registration as it is not temporary inactive",
        400
      );
    }
    // Update the status to "active" again
    registration.status = "active";
    await registration.save({ transaction: t });
    // Update Bike also
    const bike = await Bike.findOne({
      where: { plateNumber: registration.plateNumber },
    });
    if (!bike) {
      return errorResponse(req, res, "Bike not found", 404);
    }
    // Set bike status to active
    await bike.update({ status: "active" }, { transaction: t });
    // Create Registration History
    await createRegistrationHistory(
      "active",
      req.user.fullName,
      registration.registrationId
    );
    // Send notification to user
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Reactivated";
      const notificationBody = `Your registration with plate number: ${registration.plateNumber} has been reactivated.`;
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    await t.commit();
    return successResponse(req, res, "Disable registration successfully");
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin rejects a user registration with message in UI , reject when user want to registration
const rejectRegistration = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const { message } = req.body;

    // Find the registration by ID
    const registration = await Registration.findByPk(registrationId);

    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }
    // Check if the registration is already rejected
    if (registration.status !== "created" && registration.status !== "paid") {
      return errorResponse(
        req,
        res,
        "Registration is can not be rejected if not created or paid",
        400
      );
    }
    // Update the registration status to "rejected"
    registration.status = "rejected";
    await registration.save();

    // Store the rejection message in a variable
    const rejectionMessage = message || "Your registration has been rejected.";
    // Send notification to user
    const user = await User.findByPk(registration.userId);
    if (user) {
      const notificationTitle = "Registration Rejected";
      const notificationBody = rejectionMessage;
      await notificationController.sendNotificationMessage(
        user.userId,
        notificationTitle,
        notificationBody
      );
      await createNotification(
        user.userId,
        notificationBody, //message
        notificationTitle, //notiType
        t
      );
    }
    return successResponse(req, res, {
      message: rejectionMessage,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// User view a specific registration
const getUserRegistration = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const userId = req.user.userId;
    let amount = 0;
    const registration = await Registration.findOne({
      where: { registrationId, userId },
    });
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }

    // Check if there is a successful payment for this registration
    const successfulPayment = await Payment.findOne({
      where: { registrationId, status: "success" },
    });

    if (successfulPayment) {
      // If there is a successful payment, use the payment amount
      amount = successfulPayment.amount;
    } else {
      // check status if created then 0
      if (registration.status == "created") {
        amount = 0;
        // if status is not created then set fee for verify,...
      } else {
        const residentFee = await Fee.findOne({
          where: { feeName: "resident" },
        });
        if (residentFee) {
          amount = residentFee.amount;
        } else {
          return errorResponse(
            req,
            res,
            "resident package not found",
            404,
            error
          );
        }
      }
      // If there is no successful payment, use some other logic to determine the amount
    }

    const formattedRegistration = formatRegistration(registration, amount);

    return successResponse(req, res, {
      registration: formattedRegistration,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin get a user registration
const adminGetUserRegistration = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const registration = await Registration.findByPk(registrationId);
    if (!registration) {
      return errorResponse(req, res, "Registration not found", 404);
    }

    // Check if there is a successful payment for this registration
    const successfulPayment = await Payment.findOne({
      where: { registrationId, status: "success" },
    });

    let amount = 0;

    if (successfulPayment) {
      // If there is a successful payment, use the payment amount
      amount = successfulPayment.amount;
    } else {
      // If there is no successful payment, use some other logic to determine the amount
      const residentFee = await Fee.findOne({ where: { feeName: "resident" } });
      if (residentFee) {
        // If a fee with the name "resident" is found, use its amount
        amount = residentFee.amount;
      } else {
        // If no "resident" fee is found, ...
        return errorResponse(
          req,
          res,
          "resident package not found",
          404,
          error
        );
      }
    }

    const formattedRegistration = formatRegistration(registration);

    return successResponse(req, res, {
      registration: formattedRegistration,
      amount,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

//Admin view all
const allRegistration = async (req, res) => {
  try {
    // Retrieve all registrations
    const registrations = await Registration.findAll({
      attributes: { exclude: ["faceImage"] },
      include: [
        {
          model: User,
          attributes: ["username"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    // Check if there are registrations
    if (registrations.length === 0) {
      return successResponse(req, res, "No registrations found");
    }
    const formattedRegistrations = registrations.map((registration) =>
      formatRegistration(registration)
    );
    return successResponse(req, res, formattedRegistrations);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

//Admin search Registration
const searchRegistration = async (req, res) => {
  const { plateNumber } = req.query;

  try {
    const registrations = await Registration.findAll({
      where: {
        plateNumber: {
          [Op.like]: `%${String(plateNumber)}%`, // Convert to string explicitly
        },
      },
    });
    return successResponse(req, res, registrations);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
module.exports = {
  createRegistration,
  activateRegistration,
  deactivateRegistration,
  rejectRegistration,
  getAllUserRegistration,
  allRegistration,
  getUserRegistration,
  createRegistrationHistory,
  verifyRegistration,
  cancelRegistration,
  temporaryDeactivateRegistration,
  adminGetUserRegistration,
  reactivateRegistration,
  searchRegistration,
};
