// controllers/cardController.js

const { Card, CardHistory, ParkingType, Bike } = require("../../models");
const {
  successResponse,
  errorResponse,
  formatToMoment,
} = require("../../helpers");
const sequelize = require("../../config/sequelize");

// Sub func
const formatCard = (card, plateNumber) => {
  const formattedCard = {
    ...card.toJSON(),
    plateNumber: plateNumber,
    createdAt: formatToMoment(card.createdAt),
    updatedAt: formatToMoment(card.updatedAt),
  };
  return formattedCard;
};
// Create a new card
const createCard = async (req, res) => {
  const t = await sequelize.transaction();
  const newCards = [];
  try {
    const parkingType = await ParkingType.findOne({ where: { name: "guest" } });
    console.log(parkingType);
    for (const { cardId } of req.body) {
      const currentDate = new Date();
      const newCard = await Card.create(
        {
          cardId: cardId,
          startDate: currentDate,
          status: "active",
          createdAt: currentDate,
          updatedAt: currentDate,
          parkingTypeId: parkingType.parkingTypeId,
        },
        { transaction: t, ignoreDuplicates: true } // Use for ignore duplicate card
      );
      newCards.push(newCard);
      if (newCard) {
        await CardHistory.create(
          {
            eventType: "Card Created",
            cardId: newCard.cardId,
            updatedAt: currentDate,
            approvedBy: "auto",
          },
          { transaction: t }
        );
      }
    }

    await t.commit();
    return successResponse(req, res, newCards.cardId, 201);
  } catch (error) {
    console.error(error);
    await t.rollback();
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Get all cards
const getAllCards = async (req, res) => {
  try {
    const allCards = await Card.findAll({
      include: {
        model: Bike,
        attributes: ["plateNumber"],
        order: [["updatedAt", "DESC"]],
      },
    });

    if (!allCards || allCards.length === 0) {
      return errorResponse(req, res, "No Cards", 404);
    }
    const formattedCards = [];
    for (const card of allCards) {
      let plateNumber = "";
      if (card.bikeId) {
        const bike = await Bike.findByPk(card.bikeId);
        plateNumber = bike.plateNumber;
      }
      const formattedCard = formatCard(card, plateNumber);
      formattedCards.push(formattedCard);
    }
    return successResponse(req, res, { cards: formattedCards }, 200);
  } catch (error) {
    console.error("Internal Server Error:", error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Get all cards active
const getAllActiveCards = async (req, res) => {
  try {
    const activeCards = await Card.findAll({
      where: {
        status: "active",
      },
    });

    if (!activeCards || activeCards.length === 0) {
      return errorResponse(req, res, "No Active Cards", 404);
    }

    const formattedActiveCards = activeCards.map((card) => formatCard(card));
    return successResponse(
      req,
      res,
      { activeCards: formattedActiveCards },
      200
    );
  } catch (error) {
    console.error("Internal Server Error:", error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Get all cards for a user
const getAllUserCards = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userCards = await Card.findAll({
      where: { userId },
    });

    if (!userCards) {
      return errorResponse(req, res, "Cards not found", 404);
    }
    const formattedCards = userCards.map((card) => formatCard(card));
    return successResponse(req, res, { cards: formattedCards }, 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Admin get details of a specific card
const getCardDetails = async (req, res) => {
  try {
    const { cardId } = req.query;
    const card = await Card.findByPk(cardId);
    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }
    const parkingType = await ParkingType.findByPk(card.parkingTypeId);
    // const formattedCard = formatCard(card);
    return successResponse(
      req,
      res,
      {
        cardId: cardId,
        status: card.status,
        parkingTypeName: parkingType.name,
      },
      200
    );
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Update card details
const updateCard = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { cardId } = req.params;
    const { expiredDate, cardType } = req.body;

    const card = await Card.findByPk(cardId);

    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }

    card.expiredDate = expiredDate;
    card.cardType = cardType;

    await card.save({ transaction: t });

    await CardHistory.create(
      {
        eventType: "Card Updated",
        eventTime: new Date().toISOString(),
        details: "Card updated successfully",
        cardId: card.cardId,
        status: card.status,
      },
      { transaction: t }
    );

    await t.commit();
    const formattedCard = formatCard(card);
    return successResponse(req, res, { card: formattedCard }, 200);
  } catch (error) {
    console.error(error);
    await t.rollback();
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

// Delete a card
const revokeCardByPlateNumber = async (req, res) => {
  try {
    const { plateNumber } = req.query;
    const t = await sequelize.transaction();

    const bike = await Bike.findOne({
      where: { plateNumber: plateNumber },
    });
    const parkingTypeGuest = await ParkingType.findOne({
      where: { name: "guest" },
    });

    const cards = await Card.findAll({
      where: { bikeId: bike.bikeId },
    });
    if (!cards || cards.length === 0) {
      return errorResponse(req, res, "No card not found", 404);
    }

    for (const card of cards) {
      card.bikeId = null;
      card.parkingTypeId = parkingTypeGuest.parkingTypeId;
      await card.save({ transaction: t });
    }
    await t.commit();

    return successResponse(req, res, "Cards revoked successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin Assign Card - for user, list bike they own, then assign card
const assignCardToBike = async (req, res) => {
  try {
    const { plateNumber, cardId } = req.body;

    // Find the bike by plateNumber
    const bike = await Bike.findOne({ where: { plateNumber } });
    if (!bike) {
      return errorResponse(req, res, "Bike not found", 404);
    }

    // Find the card by ID
    const card = await Card.findByPk(cardId);
    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }

    // Check if the card is already assigned to another bike
    if (card.bikeId !== null) {
      return errorResponse(
        req,
        res,
        "Card is already assigned to another bike",
        400
      );
    }

    // Assign the card to the bike
    card.bikeId = bike.bikeId;
    card.status = "assigned";
    await card.save();

    return successResponse(req, res, "Card assigned to bike successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin brute force deactive card
const deactiveCard = async (req, res) => {
  try {
    const { cardId } = req.params;

    // Find the card by ID
    const card = await Card.findByPk(cardId);
    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }

    // Disassociate the card from the bike
    const bikeId = card.bikeId;
    if (bikeId !== null) {
      const bike = await Bike.findByPk(bikeId);
      if (bike) {
        bike.cardId = null;
        await bike.save();
      }
    }

    // Update the card status to "inactive"
    card.status = "inactive";
    await card.save();

    return successResponse(req, res, "Card deactivated successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};
// Admin  active card
const activeCard = async (req, res) => {
  try {
    const { cardId } = req.params;

    // Find the card by ID
    const card = await Card.findByPk(cardId);
    if (!card) {
      return errorResponse(req, res, "Card not found", 404);
    }

    // Check if the card status is "inactive"
    if (card.status !== "inactive") {
      return errorResponse(req, res, "Card is not inactive", 400);
    }

    // Activate the card
    card.status = "active";
    await card.save();

    return successResponse(req, res, "Card activated successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(req, res, "Internal Server Error", 500, error);
  }
};

module.exports = {
  createCard,
  getAllUserCards,
  getCardDetails,
  updateCard,
  revokeCardByPlateNumber,
  getAllCards,
  getAllActiveCards,
  assignCardToBike,
  deactiveCard,
  activeCard,
};
