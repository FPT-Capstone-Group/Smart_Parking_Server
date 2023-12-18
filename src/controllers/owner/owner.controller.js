// owner.controller.js
const { Owner, Bike } = require("../../models");
const {
  successResponse,
  errorResponse,
  formatToMoment,
} = require("../../helpers");
const { Op } = require("sequelize");
// Sub function
const formatOwner = (owner) => {
  const formattedOwner = {
    ...owner.toJSON(),
    createdAt: formatToMoment(owner.createdAt),
    updatedAt: formatToMoment(owner.updatedAt),
  };
  return formattedOwner;
};
const createUserHistory = async (userId, eventName) => {
  return UserHistory.create({
    userId,
    eventName,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};
// Main function
const createOwner = async (req, res) => {
  const { fullName, plateNumber, ownerFaceImage, relationship, gender } =
    req.body;
  const userId = req.user.userId;
  try {
    if (!plateNumber) {
      return errorResponse(req, res, "Plate number is required", 400);
    }
    // Check if the plateNumber already exists in the Bike model
    const existingBike = await Bike.findOne({
      where: { plateNumber },
    });
    if (!existingBike || existingBike.status !== "active") {
      return errorResponse(
        req,
        res,
        "Cannot create owner. Invalid plateNumber or bike is not active",
        400
      );
    }
    // Check maximum active owners
    const totalActiveOwners = await Owner.count({
      where: {
        isActive: { [Op.eq]: true },
        bikeId: existingBike.bikeId,
      },
    });

    if (totalActiveOwners >= 4) {
      return errorResponse(
        req,
        res,
        "Cannot create more owner. Total active owners has reached the limit (4)",
        400
      );
    }
    // Check if the plateNumber is already associated with an owner
    let existingOwner = await Owner.findOne({
      where: { bikeId: existingBike.bikeId },
    });
    if (existingOwner) {
      // If an existing owner is found and check if req.body.relationship is "Owner"
      // Otherwise, the relationship can be anything you want
      if (
        existingOwner.relationship === "owner" &&
        req.body.relationship === "owner"
      ) {
        return errorResponse(
          req,
          res,
          "Cannot create owner. Existing owner is already marked as 'owner'",
          400
        );
      }
    }

    // Create a new owner and associate it with the existing bike
    const newOwner = await Owner.create({
      fullName,
      ownerFaceImage,
      relationship: relationship || "owner",
      gender,
      bikeId: existingBike.bikeId,
    });
    await createUserHistory(userId, "Owner Added");
    const formattedOwner = formatOwner(newOwner);

    return successResponse(req, res, { owner: formattedOwner }, 201);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Security, admin
const getOwnersByPlateNumber = async (req, res) => {
  try {
    const { plateNumber } = req.query;
    const bike = await Bike.findOne({
      where: { plateNumber },
    });
    if (!bike) {
      return errorResponse(req, res, "No Bike Found", 404);
    }
    const owners = await Owner.findAll({
      where: {
        bikeId: bike.bikeId,
        isActive: true,
      },
    });
    if (!owners || owners.length === 0) {
      return errorResponse(req, res, "No Owners found", 404);
    }
    // Format dates in each owner before sending the response
    const formattedOwners = owners.map((owner) => formatOwner(owner));
    // return successResponse(req, res, { owners: formattedOwners }, 200);
    return successResponse(req, res, formattedOwners, 200);
  } catch (error) {
    console.error("Internal Server Error:", error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// User
const getOwnersByUsersPlateNumber = async (req, res) => {
  try {
    const { plateNumber } = req.query;
    const user = req.user;

    // Check if the user owns the bike with the provided plate number
    const bike = await Bike.findOne({
      where: { plateNumber, userId: user.userId },
    });

    if (!bike) {
      return errorResponse(
        req,
        res,
        "The bike is invalid or is not associated with the user",
        404
      );
    }

    const owners = await Owner.findAll({
      where: { bikeId: bike.bikeId },
    });

    if (!owners || owners.length === 0) {
      return errorResponse(req, res, "No Owners found", 404);
    }

    // Format dates in each owner before sending the response
    const formattedOwner = owners.map((owner) => formatOwner(owner));

    return successResponse(req, res, { owners: formattedOwner }, 200);
  } catch (error) {
    console.error("Internal Server Error:", error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

//User
const activateOwner = async (req, res) => {
  const { ownerId } = req.body;
  try {
    const updatingOwner = await Owner.findByPk(ownerId);
    if (!updatingOwner) {
      return errorResponse(req, res, `Cannot find ownerId: ${ownerId}`, 400);
    }

    // Check if the plateNumber already exists in the Bike model
    const existingBike = await Bike.findByPk(updatingOwner.bikeId);
    if (!existingBike || existingBike.status !== "active") {
      return errorResponse(
        req,
        res,
        "Cannot active owner. Invalid plateNumber or bike is not active",
        400
      );
    }
    // Check maximum active owners
    const totalActiveOwners = await Owner.count({
      where: {
        isActive: { [Op.eq]: true },
        bikeId: updatingOwner.bikeId,
      },
    });
    if (totalActiveOwners >= 4) {
      return errorResponse(
        req,
        res,
        "Cannot activate more owner. Total active owners has reached the limit (4)",
        400
      );
    }

    if (updatingOwner.isActive) {
      return successResponse(req, res, `${ownerId} is already active`, 200);
    }
    updatingOwner.isActive = true;
    await updatingOwner.save();
    await createUserHistory(userId, "Owner Activated");
    const formattedOwner = formatOwner(updatingOwner);

    return successResponse(req, res, { owner: formattedOwner }, 201);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

const deactivateOwner = async (req, res) => {
  const userId = req.user.userId;
  const { ownerId } = req.body;
  try {
    const updatingOwner = await Owner.findByPk(ownerId);
    console.log(updatingOwner);
    if (!updatingOwner) {
      return errorResponse(req, res, `Cannot find ownerId: ${ownerId}`, 400);
    }
    if (updatingOwner.relationship === "owner") {
      return errorResponse(req, res, `Cannot deactivate the bike's owner`, 400);
    }

    if (!updatingOwner.isActive) {
      return successResponse(req, res, `${ownerId} is already inactive`, 200);
    }
    updatingOwner.isActive = false;
    await updatingOwner.save();

    const formattedOwner = formatOwner(updatingOwner);
    await createUserHistory(userId, "Owner Deactivated");
    return successResponse(req, res, { owner: formattedOwner }, 201);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

module.exports = {
  createOwner,
  getOwnersByPlateNumber,
  getOwnersByUsersPlateNumber,
  activateOwner,
  deactivateOwner,
};
