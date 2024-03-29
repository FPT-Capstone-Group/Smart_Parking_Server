"use strict";
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("Payments", {
            paymentId: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            transactionId: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            paymentAmount: {
                type: Sequelize.FLOAT,
                allowNull: false,
            },
            paymentStatus: {
                type: Sequelize.STRING,
                defaultValue: "processing",
                allowNull: false,
            },
            paymentMethod: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            parkingOrderId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: "ParkingOrders",
                    key: "parkingOrderId",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
    },
    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("Payments");
    },
};
