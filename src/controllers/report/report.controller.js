// controllers/reportController.js

const {ParkingSession, ParkingType, Bike} = require("../../models");
const {
    successResponse,
    errorResponse,
    formatToMoment,
} = require("../../helpers");
const sequelize = require("../../config/sequelize");
const {Op} = require("sequelize");


const getTotalCheckin = async (req, res) => {
    try {
        const {parkingTypeName, dateStart, dateEnd} = req.query

        const parkingType = await ParkingType.findOne({where: {name: parkingTypeName}});

        const parkingSessionCount = await ParkingSession.count({
            where: {
                parkingTypeId: parkingType.parkingTypeId,
                checkinTime: {[Op.between]: [dateStart, dateEnd]}
            },
        });

        return successResponse(req, res, parkingSessionCount, 201);
    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const getTotalCheckout = async (req, res) => {
    try {
        const {parkingTypeName, dateStart, dateEnd} = req.query

        const parkingType = await ParkingType.findOne({where: {name: parkingTypeName}});

        const parkingSessionCount = await ParkingSession.count({
            where: {
                parkingTypeId: parkingType.parkingTypeId,
                checkoutTime: {[Op.between]: [dateStart, dateEnd]}
            },
        });
        return successResponse(req, res, parkingSessionCount, 201);
    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const getTotalGuestIncome = async (req, res) => {
    try {
        const {dateStart, dateEnd} = req.query

        const parkingType = await ParkingType.findOne({where: {name: 'guest'}});
        const guestIncome = await ParkingSession.sum('parkingFee', {
            where: {
                parkingTypeId: parkingType.parkingTypeId,
                checkoutTime: {[Op.between]: [dateStart, dateEnd]}
            },
        });
        if (!guestIncome)
            return successResponse(req, res, 0, 201);

        return successResponse(req, res, guestIncome, 201);
    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};

const getGuestIncomeGroupByDate = async (req, res) => {
    try {
        const {dateStart, dateEnd} = req.query

        const parkingType = await ParkingType.findOne({where: {name: 'guest'}});
        const result = await ParkingSession.findAll({
            attributes: [
                [sequelize.fn('SUM', sequelize.col('parkingFee')), 'totalParkingFee'],
                [sequelize.literal(`DATE("checkoutTime")`), 'date'],
            ],
            where: {
                parkingTypeId: parkingType.parkingTypeId,
                checkoutTime: {
                    [Op.between]: [dateStart, dateEnd],
                },
            },
            group: [sequelize.literal(`DATE("checkoutTime")`)],
            raw: true,
        });


        return successResponse(req, res, result, 201);
    } catch (error) {
        console.error(error);
        return errorResponse(req, res, "Internal Server Error", 500, error);
    }
};


module.exports = {
    getTotalCheckin,
    getTotalCheckout,
    getTotalGuestIncome,
    getGuestIncomeGroupByDate
};
