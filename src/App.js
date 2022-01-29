import { useEffect, useRef, useState } from "react";
import protooClient from "protoo-client";
const mediasoupClient = require("mediasoup-client");

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [params, setParams] = useState(null);
  const [transPort, setTransPort] = useState(null);
  const [peer, setPeer] = useState(null);

  const [rtpCapabilities, setRtpCapabilities] = useState(null);

  const [producerDevice, setProducerDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);

  const [consumerDevice, setConsumerDevice] = useState(null);
  const [consumerTransport, setConsumerTransport] = useState(null);

  useEffect(() => {
    //?room=test1&peer=peer1&role=produce
    const params = window.location.search;
    const newTransport = new protooClient.WebSocketTransport(
      `ws://localhost:4443/${params}`
    );
    const newPeer = new protooClient.Peer(newTransport);

    setTransPort(newTransport);
    setPeer(newPeer);
  }, []);

  // local video 가져오기
  const streamSuccess = async (stream) => {
    localVideoRef.current.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    setParams({
      track,
      // mediasoup params
      encodings: [
        {
          rid: "r0",
          maxBitrate: 100000,
          scalabilityMode: "S1T3",
        },
        {
          rid: "r1",
          maxBitrate: 300000,
          scalabilityMode: "S1T3",
        },
        {
          rid: "r2",
          maxBitrate: 900000,
          scalabilityMode: "S1T3",
        },
      ],
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
      codecOptions: {
        videoGoogleStartBitrate: 1000,
      },
    });
  };

  const getLocalStream = () => {
    navigator.getUserMedia(
      {
        audio: false,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      },
      streamSuccess,
      (error) => {
        console.log(error.message);
      }
    );
  };

  // routerRtpCapabilities 가져오기
  const handleGetRtpCapa = async () => {
    try {
      const rtpCapabilities = await peer.request("getRouterRtpCapabilities");
      setRtpCapabilities(rtpCapabilities);
      console.log("~~~~~~~~rtpCapabilities~~~~~~~~~~~~");
      console.log(rtpCapabilities);
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
    } catch (err) {
      console.log(err);
    }
  };

  // producer device 생성
  const handleCreateProducerDevice = async () => {
    try {
      const newProducerDevice = new mediasoupClient.Device();

      await newProducerDevice.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("~~~~~~~~~producerDevice~~~~~~~~~~~~");
      console.log(newProducerDevice);
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

      setProducerDevice(newProducerDevice);
    } catch (error) {
      console.log(error);
    }
  };

  // producer(sender) transport 생성
  const handleCreateProducerTransPort = async () => {
    try {
      const senderTransportParams = await peer.request("createWebRtcTransport");

      console.log("~~~~~~~~~ProducerTransPort~~~~~~~~~~~~");
      console.log(senderTransportParams);
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

      const newProducerTransport = producerDevice.createSendTransport(
        senderTransportParams
      );

      newProducerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            const dtlsParams = await peer.request("produceConnect", {
              dtlsParameters: dtlsParameters,
            });
            console.log("~~~~~~~~~dtlsParams~~~~~~~~~~~~~~~~");
            console.log(dtlsParams);
            console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      newProducerTransport.on(
        "produce",
        async (parameters, callback, errback) => {
          console.log(parameters);
          try {
            await peer.request("produceProduce", {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            });
            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      setProducerTransport(newProducerTransport);
    } catch (error) {
      console.log(error);
    }
  };

  // producer(sender) transport 연결
  const handleConnectSendTransport = async () => {
    console.log(params);
    const newProducer = await producerTransport.produce(params);

    newProducer.on("trackended", () => {
      console.log("track ended");
    });

    newProducer.on("transportClose", () => {
      console.log("transport ended");
    });
  };

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  const handleCreateConsumerDevice = async () => {
    try {
      const newConsumerDevice = new mediasoupClient.Device();

      await newConsumerDevice.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("~~~~~~~~~consumerDevice~~~~~~~~~~~~");
      console.log(newConsumerDevice);
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

      setConsumerDevice(newConsumerDevice);
    } catch (error) {
      console.log(error);
    }
  };

  // recv transport 생성
  const handleCreateRecvTransPort = async () => {
    const recvTransportParams = await peer.request("createWebRtcTransport");

    console.log("~~~~~~~~~recvTransportParams~~~~~~~~~~~~");
    console.log(recvTransportParams);
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

    const newConsumerTransport =
      consumerDevice.createRecvTransport(recvTransportParams);

    newConsumerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await peer.request("connectConsume", {
            // transportId: newConsumerTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error);
        }
      }
    );

    setConsumerTransport(newConsumerTransport);
  };

  const handleConnectRecvTransport = async () => {
    const params = await peer.request("consume", {
      rtpCapabilities: consumerDevice.rtpCapabilities,
    });
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.log(params);

    try {
      const newConsumer = await consumerTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters,
      });

      console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      console.log(newConsumer);
      console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

      const { track } = newConsumer;
      console.log(track);
      remoteVideoRef.current.srcObject = new MediaStream([track]);

      await peer.request("consumerResume");
    } catch (error) {
      console.log(error.message);
    }
  };

  return (
    <div id='video'>
      <table>
        <thead>
          <th>Local Video</th>
          <th>Remote Video</th>
        </thead>
        <tbody>
          <tr>
            <td>
              <div id='sharedBtns'>
                <video
                  id='localVideo'
                  autoPlay
                  class='video'
                  ref={localVideoRef}
                ></video>
              </div>
            </td>
            <td>
              <div id='sharedBtns'>
                <video
                  id='remoteVideo'
                  autoPlay
                  class='video'
                  ref={remoteVideoRef}
                ></video>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div id='sharedBtns'>
                <button id='btnLocalVideo' onClick={getLocalStream}>
                  1. Get Local Video
                </button>
              </div>
            </td>
          </tr>
          <tr>
            <td colspan='2'>
              <div id='sharedBtns'>
                <button id='btnRtpCapabilities' onClick={handleGetRtpCapa}>
                  2. Get Rtp Capabilities
                </button>
                <br />
                <button id='btnDevice' onClick={handleCreateProducerDevice}>
                  3. Create Device
                </button>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div id='sharedBtns'>
                <button
                  id='btnCreateSendTransport'
                  onClick={handleCreateProducerTransPort}
                >
                  4. Create Send Transport
                </button>
                <br />
                <button
                  id='btnConnectSendTransport'
                  onClick={handleConnectSendTransport}
                >
                  5. Connect Send Transport & Produce
                </button>
              </div>
            </td>
            <td>
              <div id='sharedBtns'>
                <button id='recBtnDevice' onClick={handleCreateConsumerDevice}>
                  6. Create Recv Button
                </button>
                <button
                  id='btnRecvSendTransport'
                  onClick={handleCreateRecvTransPort}
                >
                  7. Create Recv Transport
                </button>
                <br />
                <button
                  id='btnConnectRecvTransport'
                  onClick={handleConnectRecvTransport}
                >
                  8. Connect Recv Transport & Consume
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default App;
