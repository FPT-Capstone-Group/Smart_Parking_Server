const express = require("express");
const validate = require("express-validation");

const userController = require("../controllers/user/user.controller");
const registrationController = require("../controllers/registration/registration.controller");
const bikeController = require("../controllers/bike/bike.controller");
const ownerController = require("../controllers/owner/owner.controller");
const feeController = require("../controllers/fee/fee.controller");
const cardController = require("../controllers/card/card.controller");
const parkingSessionController = require("../controllers/parkingSession/parkingSession.controller");
const notificationController = require("../controllers/notification/notification.controller");
const registrationHistoryController = require("../controllers/registrationHistory/registrationHistory.controller");
const feeHistoryController = require("../controllers/feeHistory/feeHistory.controller");
const paymentController = require("../controllers/payment/payment.controller");
const parkingTypeController = require("../controllers/parkingType/parkingType.controller");
const reportController = require("../controllers/report/report.controller");
const userHistoryController = require("../controllers/userHistory/userHistory.controller");

const router = express.Router();

//= ===============================
// Admin routes
//= ===============================

//Registration
router.get(
  "/registrations/allRegistrations",
  registrationController.allRegistration
);
router.get(
  "/registrations/:registrationId",
  registrationController.adminGetUserRegistration
);
router.put(
  "/registrations/active/:registrationId/",
  registrationController.activateRegistration
);
router.put(
  "/registrations/deactivate/:registrationId/",
  registrationController.temporaryDeactivateRegistration
);
router.put(
  "/registrations/verify/:registrationId",
  registrationController.verifyRegistration
);
router.put(
  "/registrations/reject/:registrationId",
  registrationController.rejectRegistration
);
router.put(
  "/registrations/reactivate/:registrationId",
  registrationController.reactivateRegistration
);
router.get(
  "/registrations/payment/:registrationId",
  paymentController.getPaymentsForRegistration
);
router.get("/registrations/search", registrationController.searchRegistration);

//Registration History
router.get(
  "/registrations/history/:registrationId",
  registrationHistoryController.getRegistrationHistory
);

//Bike
router.post("/bikes", bikeController.createBike);
router.get("/bikes", bikeController.getAllBikes);
router.get("/bikes/:bikeId", bikeController.getBikeInfo);

//User
router.get("/users", userController.allUsers);
router.get("/users/:userId", userController.getUserInfo);
router.put("/users/active/:userId", userController.activateUser);
router.put("/users/deactive/:userId", userController.deactivateUser);
router.post("/users", userController.createSecurityAccount);

//User History
router.get(
  "/users/:userId/history",
  userHistoryController.getAllUserHistoryForUser
);
//Owner
router.post("/owners/create", ownerController.createOwner);

//Card
router.post("/cards", cardController.createCard);
router.get("/cards", cardController.getAllCards);
router.get("/cards/userId", cardController.getAllUserCards);
router.get("/cards/:cardId", cardController.getCardDetails);
router.put("/cards/:cardId", cardController.updateCard);
router.get("/active-cards", cardController.getAllActiveCards);
router.put("/cards/revoke", cardController.revokeCardByPlateNumber);
router.post("/cards/assign", cardController.assignCardToBike);
router.put("/cards/deactive/:cardId", cardController.deactiveCard);
router.put("/cards/active/:cardId", cardController.activeCard);
//Notification
router.post("/notifications/send", notificationController.sendNotification);

// Parking Session
router.get("/sessions", parkingSessionController.getAllParkingSessions);
router.get(
  "/sessions/:parkingSessionId",
  parkingSessionController.getParkingSessionById
);

// Parking Type
router.get("/parkingTypes", parkingTypeController.getAllParkingTypes);
router.post("/parkingTypes", parkingTypeController.createParkingType);
router.get(
  "/parkingTypes/:parkingTypeId",
  parkingTypeController.getParkingTypeById
);
router.put(
  "/parkingTypes/:parkingTypeId",
  parkingTypeController.updateParkingTypeById
);
router.delete(
  "/parkingTypes/delete/:parkingTypeId",
  parkingTypeController.deleteParkingTypeById
);

//Fee
router.post("/fees", feeController.createFee);
router.get("/fees", feeController.getAllFees);
router.get("/fees/:feeId", feeController.getFeeById);
router.put("/fees/:feeId", feeController.updateFeeById);
router.delete("/fees/:feeId", feeController.deleteFeeById);
router.get("/fees-deleted", feeController.getAllFeesWithDeleted);

// Fee History
router.get("/fees/:feeId/history", feeHistoryController.getFeeHistory);

// Payments
router.get("/payments", paymentController.getAllPayments);

// Reports
router.get("/getTotalCheckin", reportController.getTotalCheckin);
router.get("/getTotalCheckout", reportController.getTotalCheckout);
router.get("/getTotalGuestIncome", reportController.getTotalGuestIncome);
router.get(
  "/getGuestIncomeGroupByDate",
  reportController.getGuestIncomeGroupByDate
);

module.exports = router;
