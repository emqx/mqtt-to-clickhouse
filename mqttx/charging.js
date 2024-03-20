// store client data
const clients = {};
let index = 0;
// 充电时长范围，分钟
const chargeTimeDuration = [5, 10, 15, 30, 45, 60, 90, 120, 150, 165, 180];
// 充电功率
const powerOptions = [20, 40, 60, 80, 120, 160, 250];
// 充电电压
const voltageOptions = [300, 450, 500, 650, 800];
// 停止原因
const stopReasonOptions = ["SoftStop", "SoftStop", "SoftStop", "SoftStop", "SoftStop", "SoftStop", "RemoteStop", "EVDisconnected", "EVDisconnected", "Other"];

function generator(faker, options) {
  const clientId = options.clientId;
  let clientData = clients[clientId];
  // 如果该 clientId 不存在对应的状态和计数器，则初始化
  if (!clientData) {
    // 从过去的 48 小时开始模拟
    const startTimestamp = Date.now() - 48 * 3600 * 1000;
    const power = faker.helpers.arrayElement(powerOptions)
    clientData = {
      lastChargeStart: null,
      startPower: power,
      // 充电功率千瓦
      power: power,
      // 充电电压伏特
      voltage: faker.helpers.arrayElement(voltageOptions),
      // 充电开始时间
      startTimestamp: startTimestamp,
      // 充电结束时间
      endTimestamp: startTimestamp + faker.helpers.arrayElement(chargeTimeDuration) * 60 * 1000,
      // 时间百分比
      timePercentage: 0,
      currentTimestamp: startTimestamp,
      pauseDuration: 0,
      isPaused: false,
      counter: 0,
      // 起始读数 1000
      meterStart: faker.datatype.number({ min: 1000, max: 10000 }),
      meter: 0,
      // 固定的 connectorId
      connectorId: faker.datatype.uuid(),
      // 开始温度
      currentTemperature: faker.datatype.number({ min: 20, max: 40 }),
      // 变量
      // 每次充电的 transactionId
      transactionId: faker.datatype.uuid(),
      idTag: `No. ${index++}`
    };
    clients[clientId] = clientData;
  }

  let data = {}
  let topic = ''

  // 暂停充电
  if (clientData.isPaused) {
    clientData.currentTimestamp = clientData.currentTimestamp + 10 * 1000;
    clientData.pauseDuration -= 10 * 1000;
    if (clientData.pauseDuration <= 0) {
      clientData.counter = 0;
      clientData.isPaused = false;
    }
    return { topic: `mqttx/simulate/${clientId}/paused`, message: JSON.stringify({ pauseDuration: Math.floor(clientData.pauseDuration / 1000) }) }
  }

  // 开始充电
  if (clientData.counter === 0) {
    clientData.counter += 1
    // 充电初始化数据
    clientData.transactionId = faker.datatype.uuid()
    // 结束时间
    clientData.endTimestamp = clientData.currentTimestamp + faker.helpers.arrayElement(chargeTimeDuration) * 60 * 1000
    // 充电功率
    clientData.power = faker.helpers.arrayElement(powerOptions)

    topic = `mqttx/simulate/charge/${clientId}/StartTransaction`
    // 构建开始充电的数据
    data = {
      messageType: 'Call',
      action: 'StartTransaction',
      payload: {
        connectorId: clientData.connectorId,
        transactionId: clientData.transactionId,
        idTag: clientData.idTag,
        timestamp: clientData.currentTimestamp,
        reservationId: null,
        stackLevel: 0,
        meterStart: clientData.meterStart,
      }
    }
    // 开始充电：功率 kw, 时长 min, 电压 v
    console.log(`Start Charging: Power ${clientData.power} kW, duration ${(clientData.endTimestamp - clientData.currentTimestamp) / 60 / 1000} min, Voltage ${clientData.voltage} V`)
  } else if (clientData.counter !== 0) {   // 充电过程
    // 模拟充电过程中的数据上报
    // 每 10 秒上报一次
    clientData.currentTimestamp = clientData.currentTimestamp + 10 * 1000;
    clientData.counter += 1;
    clientData.timePercentage = (clientData.currentTimestamp - clientData.startTimestamp) / (clientData.endTimestamp - clientData.startTimestamp);
    // 模拟充电过程中的温度变化
    clientData.currentTemperature = adjustTemperature(clientData.currentTemperature, faker);
    // 模拟充电过程中的功率变化
    clientData.power = adjustPower(clientData.timePercentage, clientData.currentTemperature, clientData.power, clientData.startPower);
    // 计算 10 秒内的电表读数
    const currentMeter = Number((clientData.power * 10 / 3600).toFixed(4));
    clientData.meter = clientData.meter + currentMeter;

    // 构建充电过程中的电表数据
    topic = `mqttx/simulate/charge/${clientId}/MeterValues`
    data = {
      messageType: 'Call',
      action: 'MeterValues',
      payload: {
        connectorId: clientData.connectorId,
        transactionId: clientData.transactionId, // 假设随机生成一个交易ID
        timestamp: clientData.currentTimestamp,
        meterValue: {
          voltage: clientData.voltage,
          currentInput: Number((clientData.power * 1000 / clientData.voltage).toFixed(2)),
          power: clientData.power,
          meter: Number(currentMeter),
          currentTemperature: clientData.currentTemperature,
        },
      }
    };
  }
  if (clientData.currentTimestamp > clientData.endTimestamp) {
    topic = `mqttx/simulate/charge/${clientId}/StopTransaction`
    // 构建结束充电的数据
    data = {
      messageType: 'Call',
      action: 'StopTransaction',
      payload: {
        ...clientData,
        startTimestamp: clientData.startTimestamp,
        endTimestamp: clientData.endTimestamp,
        transactionId: clientData.transactionId, // 假设随机生成一个交易ID
        timestamp: clientData.currentTimestamp,
        // 根据功率与时长计算电表读数
        meterStop: clientData.meterStart + clientData.meter,
        duration: Math.floor((clientData.endTimestamp - clientData.startTimestamp) / 1000),
        reason: faker.helpers.arrayElement(stopReasonOptions),
      }
    };

    clientData.meterStart = data.payload.meterStop;
    // 生成暂停时间（10分钟到30分钟之间）
    clientData.pauseDuration = faker.datatype.number({ min: 10, max: 30 }) * 60 * 1000;;
    clientData.isPaused = true;
    // 充电完成：耗电量 kwh, 时长 min, 电表度数
    console.log(`Chanring Stop: Electricity ${(clientData.power * (clientData.endTimestamp - clientData.startTimestamp) / 1000 / 60 / 60).toFixed(2)} kwh, Duration ${(clientData.endTimestamp - clientData.startTimestamp) / 60 / 1000} min, Meter Value ${data.payload.meterStop}`)
    console.log(`Pause Duration ${clientData.pauseDuration / 1000 / 60} miniutes`)
  }

  return { topic, message: JSON.stringify(data) };
}

// Lookup table for power adjustment
const powerAdjustmentTable = [
  { threshold: 0.7, temperatureThreshold: 80, factor: 0.95 },
  { threshold: 0.8, temperatureThreshold: 85, factor: 0.7 },
  { threshold: 0.9, temperatureThreshold: 90, factor: 0.5 }
];

// Function to adjust temperature based on the current temperature
function adjustTemperature(currentTemperature, faker) {
  let adjustment = { min: -0.2, max: 0.4 };
  if (currentTemperature > 90) {
    adjustment = { min: -0.5, max: 0.3 };
  } else if (currentTemperature < 20) {
    adjustment = { min: -0.2, max: 0.6 };
  }
  return Number((currentTemperature + faker.datatype.number(adjustment)).toFixed(2));
}

// Function to adjust power based on time percentage and temperature
function adjustPower(timePercentage, currentTemperature, power, startPower) {
  for (const adjustment of powerAdjustmentTable) {
    if (timePercentage > adjustment.threshold || currentTemperature > adjustment.temperatureThreshold) {
      return Number((startPower * adjustment.factor).toFixed(2));
    }
  }
  return Number(power.toFixed(2));
}


const name = 'charging'
const author = 'EMQX Team'
const dataFormat = 'JSON'
const version = '0.0.1'
const description = 'Mock charging data auto start and stop charging.'

module.exports = {
  generator,
  name,
  author,
  dataFormat,
  version,
  description,
}
