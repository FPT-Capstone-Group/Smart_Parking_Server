module.exports = (sequelize, DataTypes) => {
  const Card = sequelize.define("Card", {
    // Define attributes for Card
    cardId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiredDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
    },
    bikeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    parkingTypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  });
  Card.associate = function (models) {
    Card.hasMany(models.CardHistory, { foreignKey: "cardId" });
    Card.belongsTo(models.Bike, { foreignKey: "bikeId" });
    Card.belongsTo(models.ParkingType, { foreignKey: "parkingTypeId" });
  };
  return Card;
};
