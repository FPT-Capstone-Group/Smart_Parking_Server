// owner.controller.js
const {Owner, Bike, UserHistory, ParkingType, ParkingOrder} = require("../../models");
const {
    successResponse,
    errorResponse,
    formatToMoment,
} = require("../../helpers");
const {Op} = require("sequelize");
const moment = require("moment/moment");
// Sub function
const formattedParkingOrderInfo = (parkingOrderInfo) => {
    return {
        ...parkingOrderInfo.toJSON(),
        expiredDate: moment(parkingOrderInfo.expiredDate).format("YYYY-MM-DD"),
        createdAt: formatToMoment(parkingOrderInfo.createdAt),
        updatedAt: formatToMoment(parkingOrderInfo.updatedAt),
    };
};

const updateExpiredDate = (parkingTypeName, expiredDate) => {
    if (parkingTypeName.includes('monthly')) {
        expiredDate.setMonth(expiredDate.getMonth() + 1);
    } else if (parkingTypeName.includes('quarterly')) {
        expiredDate.setMonth(expiredDate.getMonth() + 3); // add a quarter
    } else if (parkingTypeName.includes('annually')) {
        expiredDate.setFullYear(expiredDate.getFullYear() + 1); // add a year
    }
    return expiredDate;
}

const checkExistingParkingOrder = async (bikeId) => {
    return await ParkingOrder.findOne({
        where: {
            bikeId,
            parkingOrderStatus: {
                [Op.or]: ["active", "pending"]
            },
        },
    });
}
// Main function
const getParkingOrderInfo = async (req, res) => {
    const {bikeId, parkingTypeId} = req.query;
    try {
        const existingParkingOrder = await checkExistingParkingOrder(bikeId);
        if (existingParkingOrder) {
            return errorResponse(req, res, "Cannot create parking order. The bike already has an active or pending parking order", 400);
        }
        const parkingType = await ParkingType.findByPk(parkingTypeId);
        if (!parkingType) {
            return errorResponse(req, res, "Invalid parkingTypeId", 400);
        }
        const bike = await Bike.findByPk(bikeId);
        let expiredDate = new Date();
        updateExpiredDate(parkingType.parkingTypeName, expiredDate);
        const parkingOrderInfo = {
            bikeId,
            parkingTypeId,
            plateNumber: bike.plateNumber,
            parkingTypeName: parkingType.parkingTypeName,
            expiredDate: moment(expiredDate).format("YYYY-MM-DD"),
            parkingOrderAmount: parkingType.parkingTypeFee,
            createdAt: formatToMoment(new Date()),
        }

        return successResponse(req, res, parkingOrderInfo, 200);

    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};


const getParkingOrderDetail = async (req, res) => {
    const {parkingOrderId} = req.params;
    try {
        const parkingOrder = await ParkingOrder.findByPk(parkingOrderId, {
            include: [
                {
                    model: Bike,
                    attributes: ["plateNumber"],
                },
                {
                    model: ParkingType,
                    attributes: ["parkingTypeName"],
                },
            ]
        });

        if (!parkingOrder) {
            return errorResponse(req, res, "Invalid parkingOrderId", 400);
        }
        const formattedParkingOrder = formattedParkingOrderInfo(parkingOrder);
        return successResponse(req, res, formattedParkingOrder, 200);

    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const createParkingOrder = async (req, res) => {
    try {
        const {bikeId, parkingTypeId, expiredDate, parkingOrderAmount} = req.body;

        const existingParkingOrder = await checkExistingParkingOrder(bikeId);
        if (existingParkingOrder) {
            return errorResponse(req, res, "Cannot create parking order. The bike already has an active or pending parking order", 400);
        }
        const bike = await Bike.findByPk(bikeId);
        if (!bike) {
            return errorResponse(req, res, "Invalid bikeId", 400);
        }
        const parkingType = await ParkingType.findByPk(parkingTypeId);
        if (!parkingType) {
            return errorResponse(req, res, "Invalid parkingTypeId", 400);
        }

        const newParkingOrder = await ParkingOrder.create({
            bikeId,
            parkingTypeId,
            parkingOrderStatus: "pending",
            parkingOrderType: "user_created",
            expiredDate,
            parkingOrderAmount,
        });
        const formattedParkingOrder = formattedParkingOrderInfo(newParkingOrder);

        return successResponse(req, res, formattedParkingOrder, 201);
    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const createRenewalParkingOrder = async (parkingOrderId) => {
    try {
        const parkingOrder = await ParkingOrder.findByPk(parkingOrderId);
        if (!parkingOrder) {
            throw new Error(`Cannot find parkingOrderId: ${parkingOrderId}`);
        }
        const parkingType = await ParkingType.findByPk(parkingOrder.parkingTypeId);
        if (!parkingType) {
            throw new Error(`Cannot find parkingTypeId: ${parkingOrder.parkingTypeId}`);
        }
        if (!parkingType) {
            return errorResponse(req, res, "Invalid parkingTypeId", 400);
        }
        let expiredDate = parkingOrder.expiredDate;
        updateExpiredDate(parkingType.parkingTypeName, expiredDate);
        const parkingOrderAmount = parkingType.parkingTypeFee;
        await ParkingOrder.create({
            bikeId: parkingOrder.bikeId,
            parkingTypeId: parkingOrder.parkingTypeId,
            parkingOrderStatus: "pending",
            parkingOrderType: "auto_renewal",
            expiredDate,
            parkingOrderAmount,
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};


const cancelParkingOrder = async (req, res) => {
    try {
        const {parkingOrderId} = req.query;
        const parkingOrder = await ParkingOrder.findByPk(parkingOrderId);

        if (!parkingOrder) {
            return errorResponse(req, res, "Invalid parkingOrderId", 400);
        }
        if (parkingOrder.parkingOrderStatus === "canceled") {
            return errorResponse(req, res, "Parking order is already canceled", 400);
        }
        if (parkingOrder.parkingOrderStatus === "active") {
            return errorResponse(req, res, "Parking order is already active", 400);
        }
        parkingOrder.parkingOrderStatus = "canceled";
        await parkingOrder.save();
        return successResponse(req, res, `Parking order ${parkingOrderId} canceled successfully`, 200);
    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};


// Admin
const getAllParkingOrders = async (req, res) => {
    try {
        const {parkingOrderStatus, dateStart, dateEnd} = req.query;

        let conditions = {}
        // Check if the user owns the bike with the provided plate number
        if (parkingOrderStatus) conditions.parkingOrderStatus = parkingOrderStatus;
        if (dateStart && dateEnd) conditions.createdAt = {[Op.between]: [dateStart, dateEnd]};
        const parkingOrders = await ParkingOrder.findAll({
            include: [
                {
                    model: Bike,
                    attributes: ["plateNumber"],
                },
                {
                    model: ParkingType,
                    attributes: ["parkingTypeName"],
                },
            ],
            where: conditions,
        });
        if (!parkingOrders || parkingOrders.length === 0) {
            return errorResponse(req, res, "No parking orders found", 404);
        }
        const formattedParkingOrders = parkingOrders.map((parkingOrder) => formattedParkingOrderInfo(parkingOrder));

        return successResponse(req, res, {parkingOrders: formattedParkingOrders}, 200);


    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const getAllParkingOrdersByBike = async (req, res) => {
    try {
        const {bikeId} = req.query;
        const user = req.user;

        const bike = await Bike.findByPk(bikeId);
        if (!bike) {
            return errorResponse(req, res, "Invalid bikeId", 400);
        }

        const parkingOrders = await ParkingOrder.findAll({
            where: {
                bikeId
            },
            include: [
                {
                    model: ParkingType,
                    attributes: ["parkingTypeName"],
                },
                {
                    model: Bike,
                    attributes: ["plateNumber"],
                }
            ],
        });
        if (!parkingOrders || parkingOrders.length === 0) {
            return errorResponse(req, res, "No parking orders found", 404);
        }

        const formattedParkingOrders = parkingOrders.map((parkingOrder) => formattedParkingOrderInfo(parkingOrder));

        return successResponse(req, res, {parkingOrders: formattedParkingOrders}, 200);


    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const getCurrentPendingParkingOrder = async (req, res) => {
    try {
        const {bikeId} = req.query;


        const pendingParkingOrders = await ParkingOrder.findAll({
            where: {
                bikeId,
                parkingOrderStatus: "pending"
            },
        });
        if (!pendingParkingOrders || pendingParkingOrders.length === 0) {
            return errorResponse(req, res, "No parking orders found", 404);
        }

        const formattedParkingOrders = pendingParkingOrders.map((parkingOrder) => formattedParkingOrderInfo(parkingOrder));

        return successResponse(req, res, {parkingOrders: formattedParkingOrders}, 200);


    } catch (error) {
        console.error("Internal Server Error:", error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};


module.exports = {
    getParkingOrderInfo,
    getParkingOrderDetail,
    createParkingOrder,
    cancelParkingOrder,
    getAllParkingOrders,
    getAllParkingOrdersByBike,
    getCurrentPendingParkingOrder,
    createRenewalParkingOrder,
};
