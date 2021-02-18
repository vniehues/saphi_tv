/* eslint-disable max-len */
import { Service, PlatformAccessory, Categories, CharacteristicValue } from 'homebridge';
import ping from 'ping';
import { Input } from './input';
import { InputType } from './inputType';
import { Configuration } from './configuration';
import { Utilities } from './utilities';
import { SaphiTvPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TelevisionAccessory {
  private tvService: Service;
  private ambihueService!: Service;
  private ambilightService!: Service;
  private audioService!: Service;

  private TvState = {
    TvActive: false,
    AmbiHueActive: false,
    AmbilightActive: false,
  };

  power_on_body = { powerstate: 'On' };
  power_off_body = { powerstate: 'Standby' };
  ambihue_on_body = { power: 'On' };
  ambihue_off_body = { power: 'Off' };
  ambilight_on_body = { power: 'On' };
  ambilight_off_body = { power: 'Off' };
  config: Configuration;
  platform: SaphiTvPlatform;

  constructor(
    public readonly utilities: Utilities,
    private readonly tvAccessory: PlatformAccessory,
    private readonly remoteAccessory: PlatformAccessory,
  ) {
    this.config = utilities.config;
    this.platform = utilities.platform;

    this.config.inputs = this.config.inputs.filter(x => x.name && x.type && (x.position || x.position === 0 || x.type === InputType.TV));

    this.platform.log.debug('times: ', this.config.startup_time, this.config.polling_interval, this.config.input_delay, this.config.timeout);
    this.platform.log.debug('inputs: ', this.config.inputs);
    this.platform.log.debug('powerURL: ', this.config.power_url);
    this.platform.log.debug('inputURL: ', this.config.input_url);
    this.platform.log.debug('ambihueURL: ', this.config.ambihue_url);

    this.tvService = this.tvAccessory.addService(this.platform.Service.Television, 'ActiveInput');

    // Add AmbiHue switch to remote accessory
    if (this.config.has_ambilight) {

      // TODO: implement get & set with reference to old project.
      // TODO: implement brightness with reference to old project.
      // this.ambilightService = this.remoteAccessory.addService(this.platform.Service.Outlet, 'Ambilight', 'ambilight');
      // this.ambilightService.getCharacteristic(this.platform.Characteristic.On)
      //   .on('get', (callback) => {
      //     this.GetAmbilight(callback);
      //     this.platform.log.debug('Get AmbiLight');
      //   })
      //   .on('set', (newValue, callback) => {
      //     this.SetAmbilight(newValue);
      //     callback(null);
      //     this.platform.log.debug('Set AmbiLight => ' + newValue);
      //   });

      if(this.config.has_ambihue){
        this.ambihueService = this.remoteAccessory.addService(this.platform.Service.Switch, 'Ambilight Plus Hue', 'ambihue');
        this.ambihueService.getCharacteristic(this.platform.Characteristic.On)
          .on('get', (callback) => {
            this.GetAmbiHue(callback);
            this.platform.log.debug('Get AmbiHue');
          })
          .on('set', (newValue, callback) => {
            this.SetAmbiHue(newValue);
            callback(null);
            this.platform.log.debug('set AmbiHue => ' + newValue);
          });
      }
    }

    // TODO: implement get & set with reference to old project.
    // this.audioService = this.remoteAccessory.addService(this.platform.Service.Lightbulb, 'Volume', 'tvVolume');
    // this.audioService.getCharacteristic(this.platform.Characteristic.Brightness)
    //   .on('get', (callback) => {
    //     // this.GetVolume(callback);
    //     callback();
    //     this.platform.log.debug('Get Volume');
    //   })
    //   .on('set', (newValue, callback) => {
    //     const volume = newValue / 100 * 60;
    //     // this.SetVolume(volume);
    //     callback(null);
    //     this.platform.log.debug('Set Volume => ' + volume);
    //   });

    this.AddInputServices();

    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pjson = require('../package.json');

    // set accessory information
    this.tvAccessory.category = Categories.TELEVISION;
    this.tvAccessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, pjson['author'])
      .setCharacteristic(this.platform.Characteristic.Model, pjson['name'])
      .setCharacteristic(this.platform.Characteristic.Name, this.config.name)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, pjson['version'])
      .setCharacteristic(this.platform.Characteristic.SerialNumber, pjson['version']);


    //TODO: Check if Categories.TARGET_CONTROLLER will work in the future!
    this.remoteAccessory.category = Categories.TV_STREAMING_STICK;
    this.remoteAccessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, pjson['author'])
      .setCharacteristic(this.platform.Characteristic.Model, pjson['name'])
      .setCharacteristic(this.platform.Characteristic.Name, this.config.name + ' Remote')
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.config.name + ' Remote')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, pjson['version'])
      .setCharacteristic(this.platform.Characteristic.SerialNumber, pjson['version']);

    // set the tv name
    this.tvService.setCharacteristic(this.platform.Characteristic.Name, this.config.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.config.name);

    // set sleep discovery characteristic
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // handle on / off events using the Active characteristic
    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SetActive(newValue);
        this.platform.log.debug('set Active => ' + newValue);
      })
      .on('get', (callback) => {
        this.GetActive(callback);
        this.platform.log.debug('Get Active');
      });

    this.tvService.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, 0);

    // handle input source changes
    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SetActiveIdentifier(newValue);
        this.platform.log.debug('set Active Identifier => setNewValue: ' + newValue);
      });

    // handle remote control input
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SendRemoteInput(newValue);
        this.platform.log.debug('Sending RemoteInput: ' + newValue);
      });

    const speakerService = this.tvAccessory.addService(
      this.platform.Service.TelevisionSpeaker,
    );

    speakerService
      .setCharacteristic(
        this.platform.Characteristic.Active,
        this.platform.Characteristic.Active.ACTIVE,
      )
      .setCharacteristic(
        this.platform.Characteristic.VolumeControlType,
        this.platform.Characteristic.VolumeControlType.ABSOLUTE,
      );

    // handle volume control
    speakerService
      .getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on('set', (newValue, callback) => {
        callback(null, null);
        this.platform.log.debug('set VolumeSelector => setNewValue: ' + newValue);
        if (newValue === this.platform.Characteristic.VolumeSelector.DECREMENT) {
          this.SendRemoteInput('VolumeDown');
        } else {
          this.SendRemoteInput('VolumeUp');
        }
      });


    setInterval(() => {
      this.platform.log.debug('Triggering interval');

      ping.sys.probe(this.config.ip_address, (isAlive) => {
        const msg = isAlive ? 'TV is alive' : 'TV is dead';
        this.platform.log.debug(msg);
      });

      this.GetActive(null);
      if (this.config.has_ambihue) {
        this.GetAmbiHue(null);
      }
    }, this.config.polling_interval);
  }

  async AddInputServices() {
    await this.utilities.waitFor(1000);
    if (this.config.inputs && this.config.inputs.length > 0) {
    // Add inputs to TV accessory
      this.config.inputs.forEach((input: Input, index) => {
        const inputService = this.tvAccessory.addService(this.platform.Service.InputSource, input.name, 'input' + input.name + input.position || 0);
        inputService
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, input.name)
          .setCharacteristic(this.platform.Characteristic.Identifier, index)
          .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN)
          .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.APPLICATION);

        this.tvService.addLinkedService(inputService);

        // Add inputs to remote accessory
        const switchService = this.remoteAccessory.addService(this.platform.Service.Outlet, input.name, 'switchInput'+ input.name + input.position || 0);
        switchService
          .setCharacteristic(this.platform.Characteristic.Name, input.name)
          .getCharacteristic(this.platform.Characteristic.On)
          .on('set', (newValue, callback) => {
            callback(null);
            if (newValue === true) {
              if (this.TvState.TvActive === false) {
                this.SetActive(this.platform.Characteristic.Active.ACTIVE);
              }
              this.SetActiveIdentifier(index);
              switchService.updateCharacteristic(this.platform.Characteristic.On, false);
            }
          })
          .on('get', (callback) => {
            callback(false);
          });
      });
    }
  }


  async GetActive(callback) {
    await this.utilities.GET(this.config.power_url)
      .then((response) => {
        if (!response.ok) {
          throw Error(response.status);
        }
        return response;
      })
      .then(response => response.json())
      .then(result => {
        this.platform.log.debug('Success:', result);
        if (JSON.stringify(result) === JSON.stringify(this.power_on_body)) {
          this.TvState.TvActive = true;
        } else if (JSON.stringify(result) === JSON.stringify(this.power_off_body)) {
          this.TvState.TvActive = false;
        }
      })
      .catch(error => {
        if (error.response && error.response.status !== 200) {
          this.TvState.TvActive = false;
        }
        if (error.code === 'EHOSTUNREACH') {
          this.TvState.TvActive = false;
        }
        this.platform.log.debug('Error getPowerState : ', error);
      })
      .finally(() => {
        this.platform.log.debug('Now updating PowerState to:', this.TvState.TvActive);
        this.tvService.updateCharacteristic(this.platform.Characteristic.Active, this.TvState.TvActive);
        if (callback) {
          callback(null, this.TvState.TvActive);
        }
      });
  }

  async SetActive(value: CharacteristicValue) {
    const newPowerState = value === this.platform.Characteristic.Active.ACTIVE;
    this.platform.log.debug('Setting power to: ', newPowerState);
    if (newPowerState) {

      if (this.config.has_ambihue && this.config.ambi_poweron) {

        this.utilities.wolRequest(this.config.wol_url);
        await this.utilities.waitFor(this.config.startup_time)
          .then(() => {
            this.platform.log.debug('Setting AmbiHue after ', this.config.startup_time);
            if (this.ambihueService) {
              this.ambihueService.getCharacteristic(this.platform.Characteristic.On).setValue(true);
            }
          },
          );
      } else {
        await this.utilities.wolRequest(this.config.wol_url);
      }
    } else {

      if (this.config.has_ambihue && this.config.ambi_poweroff) {
        await this.utilities.POST(this.config.ambihue_url, this.ambihue_off_body)
          .then(
            async () => {
              await this.utilities.waitFor(this.config.input_delay)
                .then(async () => {
                  await this.utilities.POST(this.config.input_url, { key: 'Standby' });
                },
                );
            },
          );
      } else {
        await this.utilities.POST(this.config.input_url, { key: 'Standby' });
      }
    }
  }

  async GetAmbiHue(callback) {
    await this.utilities.GET(this.config.ambihue_url)
      .then((response) => {
        if (!response.ok) {
          throw Error(response.status);
        }
        return response;
      })
      .then(response => response.json())
      .then(result => {
        this.platform.log.debug('Success:', result);
        if (JSON.stringify(result) === JSON.stringify(this.ambihue_on_body)) {
          this.TvState.AmbiHueActive = true;
        } else if (JSON.stringify(result) === JSON.stringify(this.ambihue_off_body)) {
          this.TvState.AmbiHueActive = false;
        }
      })
      .catch(error => {
        if (error.response && error.response.status !== 200) {
          this.TvState.AmbiHueActive = false;
        }
        if (error.code === 'EHOSTUNREACH') {
          this.TvState.AmbiHueActive = false;
        }
        this.platform.log.debug('Error getAmbihueState : ', error);
      })
      .finally(() => {
        this.platform.log.debug('Now updating AmbiHueState to:', this.TvState.AmbiHueActive);
        if (this.ambihueService) {
          this.ambihueService.updateCharacteristic(this.platform.Characteristic.On, this.TvState.AmbiHueActive);
        }
        if (callback) {
          callback(null, this.TvState.AmbiHueActive);
        }
      });
  }

  async SetAmbiHue(value: CharacteristicValue) {
    const newPowerState = value;
    this.platform.log.debug('Setting ambihue to: ', newPowerState);
    if (this.TvState.TvActive === false) {
      this.platform.log.debug('Waiting for TV to turn on');
      await this.utilities.waitFor(this.config.startup_time);
    }
    if (newPowerState) {
      await this.utilities.POST(this.config.ambihue_url, this.ambihue_on_body);
    } else {
      await this.utilities.POST(this.config.ambihue_url, this.ambihue_off_body);
    }
  }

  async GetAmbilight(callback) {
    await this.utilities.GET(this.config.ambilight_url)
      .then((response) => {
        if (!response.ok) {
          throw Error(response.status);
        }
        return response;
      })
      .then(response => response.json())
      .then(result => {
        this.platform.log.debug('Success:', result);
        if (JSON.stringify(result) === JSON.stringify(this.ambilight_on_body)) {
          this.TvState.AmbilightActive = true;
        } else if (JSON.stringify(result) === JSON.stringify(this.ambilight_off_body)) {
          this.TvState.AmbilightActive = false;
        }
      })
      .catch(error => {
        if (error.response && error.response.status !== 200) {
          this.TvState.AmbilightActive = false;
        }
        if (error.code === 'EHOSTUNREACH') {
          this.TvState.AmbilightActive = false;
        }
        this.platform.log.debug('Error getAmbilightState : ', error);
      })
      .finally(() => {
        this.platform.log.debug('Now updating AmbilightState to:', this.TvState.AmbilightActive);
        if (this.ambihueService) {
          this.ambihueService.updateCharacteristic(this.platform.Characteristic.On, this.TvState.AmbilightActive);
        }
        if (callback) {
          callback(null, this.TvState.AmbilightActive);
        }
      });
  }

  async SetAmbilight(value: CharacteristicValue) {
    const newPowerState = value;
    this.platform.log.debug('Setting ambihue to: ', newPowerState);
    if (this.TvState.TvActive === false) {
      this.platform.log.debug('Waiting for TV to turn on');
      await this.utilities.waitFor(this.config.startup_time);
    }
    if (newPowerState) {
      await this.utilities.POST(this.config.ambilight_url, this.ambilight_on_body);
    } else {
      await this.utilities.POST(this.config.ambilight_url, this.ambilight_off_body);
    }
  }


  async SetActiveIdentifier(value: CharacteristicValue) {
    const input = this.config.inputs[value as number];
    this.platform.log.debug('Setting input to: ', input.name, input.type, InputType.App);

    if (this.TvState.TvActive === false) {
      this.platform.log.debug('Waiting for TV to turn on');
      await this.utilities.waitFor(this.config.startup_time);
    }

    if (input.type as InputType === InputType.TV) {
      await this.utilities.POST(this.config.input_url, { key: 'WatchTV' })
        .then(response => response.text())
        .then(data => this.platform.log.debug('response: ', data))
        .then(async () => await this.utilities.waitFor(this.config.input_delay))
        .then(() => {
          this.platform.log.debug('finished WatchTV');
        }).catch(() => {
          this.platform.log.debug('could not finish WatchTV');
        });
    } else {


      let stepsToMake = input.position;
      const moves: unknown[] = [];

      // Build the moves[]
      if (input.type as InputType === InputType.App) {
        moves.push({ key: 'Home' });
      }
      if (input.type as InputType === InputType.Source) {
        moves.push({ key: 'WatchTV' });
        moves.push({ key: 'Source' });
        for (let index = 0; index < input.position; index++) {
          moves.push({ key: 'CursorDown' });
        }
      }
      if (input.type as InputType === InputType.Channel) {
        moves.push({ key: 'WatchTV' });
        const num = Math.abs(input.position);
        const digits = num.toString().split('');
        digits.forEach(digit => {
          if(digit === '.') {
            moves.push({ key: 'Dot' });
          } else {
            moves.push({ key: 'Digit' + digit });
          }
        });
      } else {

        while (Math.abs(stepsToMake) !== 0) {
          if (stepsToMake > 0) {
            moves.push({ key: 'CursorRight' });
            stepsToMake--;
          }
          if (stepsToMake < 0) {
            moves.push({ key: 'CursorLeft' });
            stepsToMake++;
          }
        }
      }
      moves.push({ key: 'Confirm' });
      this.platform.log.debug('Moves: ', moves);


      // Execute moves[] one-by-one
      for (const move of moves) {
        await this.utilities.POST(this.config.input_url, move)
          .then(response => response.text())
          .then(data => this.platform.log.debug('response: ', data))
          .then(async () => await this.utilities.waitFor(this.config.input_delay))
          .then(() => {
            this.platform.log.debug('finished move ', move);
          }).catch(() => {
            this.platform.log.debug('could not finish move ', move);
          });

        // Aditional delays because WatchTV takes time to load and even more if there are no channels installed.
        if (move === { key: 'WatchTV' }) {
          if (this.config.has_tv_channels === false) {
            this.platform.log.debug('waiting ' + this.config.channel_setup_popup_time + ' ms for channel popup');
            await this.utilities.waitFor(this.config.channel_setup_popup_time);
          } else {
            await this.utilities.waitFor(this.config.input_delay);
          }
        }
      }
      this.platform.log.debug('finished moves!');
    }
  }


  async SendRemoteInput(newValue: CharacteristicValue) {
    let KeyToPress = { key: 'Home' };
    switch (newValue) {
      case this.platform.Characteristic.RemoteKey.REWIND: {
        KeyToPress = { key: 'Rewind' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
        KeyToPress = { key: 'FastForward' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
        KeyToPress = { key: 'Next' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        KeyToPress = { key: 'Previous' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_UP: {
        KeyToPress = { key: 'CursorUp' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
        KeyToPress = { key: 'CursorDown' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
        KeyToPress = { key: 'CursorLeft' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
        KeyToPress = { key: 'CursorRight' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.SELECT: {
        KeyToPress = { key: 'Confirm' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.BACK: {
        KeyToPress = { key: 'Back' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.EXIT: {
        KeyToPress = { key: 'Exit' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
        KeyToPress = { key: 'PlayPause' };
        break;
      }
      case this.platform.Characteristic.RemoteKey.INFORMATION: {
        KeyToPress = { key: 'Options' };
        break;
      }
      case 'VolumeUp': {
        KeyToPress = { key: 'VolumeUp' };
        break;
      }
      case 'VolumeDown': {
        KeyToPress = { key: 'VolumeDown' };
        break;
      }
    }

    await this.utilities.POST(this.config.input_url, KeyToPress);
  }
}
