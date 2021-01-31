/* eslint-disable max-len */

import { Service, PlatformAccessory, PlatformConfig, Categories, CharacteristicValue } from 'homebridge';

import { SaphiTvPlatform } from './platform';

import fetchTimeout from 'fetch-timeout';
import wol from 'wake_on_lan';
import ping from 'ping';

import { Input } from './input';
import { InputType } from './inputType';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TelevisionAccessory {
  ambihue_url: string;
  ambi_poweron: boolean;
  ambi_poweroff: boolean;
  has_ambihue: boolean;
  has_ambilight: boolean;
  name: string;
  polling_interval: number;
  input_delay: number;
  timeout: number;
  has_no_channels: boolean;
  channel_setup_popup_time: number;

  waitFor(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  wolRequest(url) {
    return new Promise(() => {
      this.platform.log.debug('calling WOL with URL %s', url);
      if (!url) {
        this.platform.log.warn('WOL-Error: ');
        return;
      }
      if (url.substring(0, 3).toUpperCase() === 'WOL') {
        //Wake on lan request
        const macAddress = url.replace(/^WOL[:]?[/]?[/]?/gi, '');
        this.platform.log.debug('Executing WakeOnLan request to ' + macAddress);

        wol.wake(macAddress, { num_packets: 20 }, (error) => {
          if (error) {
            this.platform.log.warn('WOL-Error: ', error);
          } else {
            this.platform.log.warn('WOL-OK!');
          }
        });
      } else {
        if (url.length > 3) {
          this.platform.log.warn('WOL-Error: ');
        } else {
          this.platform.log.warn('WOL-Error: ');
        }
      }
    },
    );
  }

  fetchWithPromise = (url: string, body: string) =>
    new Promise((resolve, reject) => {

      fetchTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body,
      }, this.timeout, 'Timeout Error')
        .then(resolve)
        .catch(reject);
    });

  private tvService: Service;
  private ambihueService?: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private TvState = {
    TvActive: false,
    AmbiHueActive: false,
  };

  power_url: string;
  input_url: string;

  protocol = 'http';
  port_no = 1925;
  api_version = 6;

  ip_address: string;

  startup_time: number;
  public readonly inputs: Input[] = [];


  power_on_body = { powerstate: 'On' };
  power_off_body = { powerstate: 'Standby' };



  ambihue_on_body = { power: 'On' };
  ambihue_off_body = { power: 'Off' };


  wol_url: string;

  constructor(
    private readonly platform: SaphiTvPlatform,
    private readonly accessory: PlatformAccessory,
    public readonly config: PlatformConfig,
  ) {
    this.ip_address = config.ip_adress as string;
    this.wol_url = config.wol_adress as string;
    this.ambi_poweron = config.ambi_poweron as boolean;
    this.ambi_poweroff = config.ambi_poweroff as boolean;
    this.inputs = config.inputs as [];
    this.name = config.name as string;

    this.startup_time = config.startup_time as number * 1000;
    this.input_delay = config.input_delay as number;
    this.timeout = config.timeout as number * 1000;
    this.polling_interval = config.polling_interval as number * 1000;

    this.protocol = config.protocol as string;
    this.api_version = config.api_version as number;
    this.port_no = config.api_port_no as number;

    this.has_no_channels = !config.has_tv_channels as boolean;
    this.channel_setup_popup_time = config.channel_setup_popup_time as number;

    this.has_ambihue = config.has_ambihue as boolean;
    this.has_ambilight = config.has_ambilight as boolean;

    if (this.has_ambilight === false) {
      this.has_ambihue = false;
    }

    if (this.startup_time < 5 * 1000 || typeof this.startup_time !== 'number' || isNaN(this.startup_time)) {
      this.startup_time = 10 * 1000;
    }

    if (this.polling_interval < 15 * 1000 || typeof this.polling_interval !== 'number' || isNaN(this.polling_interval)) {
      this.polling_interval = 30 * 1000;
    }

    if (this.input_delay < 150 || typeof this.input_delay !== 'number' || isNaN(this.input_delay)) {
      this.input_delay = 600;
    }

    if (this.timeout < 2 * 1000 || typeof this.timeout !== 'number' || isNaN(this.timeout)) {
      this.timeout = 5 * 1000;
    }

    this.input_url =
      this.protocol +
      '://' +
      this.ip_address +
      ':' +
      this.port_no +
      '/' +
      this.api_version +
      '/input/key';

    this.ambihue_url =
      this.protocol +
      '://' +
      this.ip_address +
      ':' +
      this.port_no +
      '/' +
      this.api_version +
      '/HueLamp/power';

    this.power_url =
      this.protocol +
      '://' +
      this.ip_address +
      ':' +
      this.port_no +
      '/' +
      this.api_version +
      '/powerstate';

    this.platform.log.debug('times: ', this.startup_time, this.polling_interval, this.input_delay, this.timeout);
    this.platform.log.debug('inputs: ', this.inputs);
    this.platform.log.debug('powerURL: ', this.power_url);
    this.platform.log.debug('inputURL: ', this.input_url);
    this.platform.log.debug('ambihueURL: ', this.ambihue_url);

    if (this.has_ambihue) {
      this.ambihueService = this.accessory.addService(this.platform.Service.Switch, 'Ambilight Plus');
      this.ambihueService.getCharacteristic(this.platform.Characteristic.On)
        .on('get', (callback) => {
          this.GetAmbiHue(callback);
          this.platform.log.info('Get AmbiHue');
        })
        .on('set', (newValue, callback) => {
          this.SetAmbiHue(newValue);
          callback(null);
          this.platform.log.info('set AmbiHue => ' + newValue);
        });
    }



    // get/set the service
    this.tvService = this.accessory.addService(this.platform.Service.Television, 'ActiveInput');

    if (this.inputs && this.inputs.length > 0) {
      this.inputs.forEach((input: Input, index) => {
        const inputService = this.accessory.addService(this.platform.Service.InputSource, 'input' + input.position, input.name);
        inputService
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, input.name)
          .setCharacteristic(this.platform.Characteristic.Identifier, index)
          .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN)
          .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.APPLICATION);

        this.tvService.addLinkedService(inputService);

        if (input.exposeAsSwitch === true) {
          const switchService = this.accessory.addService(this.platform.Service.Switch, 'switchInput' + input.position, input.name);
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
            });
        }
      });
    }


    // set accessory information
    this.accessory.category = Categories.TELEVISION;
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // set the tv name
    this.tvService.setCharacteristic(this.platform.Characteristic.Name, this.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.name);

    // set sleep discovery characteristic
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // handle on / off events using the Active characteristic
    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SetActive(newValue);
        this.platform.log.info('set Active => ' + newValue);
      })
      .on('get', (callback) => {
        this.GetActive(callback);
        this.platform.log.info('Get Active');
      });

    this.tvService.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, 0);

    // handle input source changes
    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SetActiveIdentifier(newValue);
        this.platform.log.info('set Active Identifier => setNewValue: ' + newValue);
      });

    // handle remote control input
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .on('set', (newValue, callback) => {
        callback(null);
        this.SendRemoteInput(newValue);
        this.platform.log.info('Sending RemoteInput: ' + newValue);
      });

    const speakerService = this.accessory.addService(
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
        this.platform.log.info('set VolumeSelector => setNewValue: ' + newValue);
        if (newValue === this.platform.Characteristic.VolumeSelector.DECREMENT) {
          this.SendRemoteInput('VolumeDown');
        } else {
          this.SendRemoteInput('VolumeUp');
        }
      });


    setInterval(() => {
      this.platform.log.debug('Triggering interval');

      ping.sys.probe(this.ip_address, (isAlive) => {
        const msg = isAlive ? 'TV is alive' : 'TV is dead';
        this.platform.log.debug(msg);
      });

      this.GetActive(null);
      if (this.has_ambihue) {
        this.GetAmbiHue(null);
      }
    }, this.polling_interval);
  }


  async GetActive(callback) {
    await fetchTimeout(this.power_url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, this.timeout, 'Timeout Error')
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

      if (this.has_ambihue && this.ambi_poweron) {

        this.wolRequest(this.wol_url);
        await this.waitFor(this.startup_time)
          .then(() => {
            this.platform.log.debug('Setting AmbiHue after ', this.startup_time);
            if (this.ambihueService) {
              this.ambihueService.getCharacteristic(this.platform.Characteristic.On).setValue(true);
            }
          },
          );
      } else {
        await this.wolRequest(this.wol_url);
      }
    } else {

      if (this.has_ambihue && this.ambi_poweroff) {
        await fetchTimeout(this.ambihue_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.ambihue_off_body),
        }).then(
          async () => {
            await this.waitFor(this.input_delay)
              .then(async () => {
                await fetchTimeout(this.input_url, {
                  method: 'POST', // or 'PUT'
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ key: 'Standby' }),
                });
              },
              );
          },
        );
      } else {
        await fetchTimeout(this.input_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ key: 'Standby' }),
        });
      }
    }
  }

  async GetAmbiHue(callback) {
    await fetchTimeout(this.ambihue_url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, this.timeout, 'Timeout Error')
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
      await this.waitFor(this.startup_time);
    }
    if (newPowerState) {
      await fetchTimeout(this.ambihue_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.ambihue_on_body),
      });
    } else {
      await fetchTimeout(this.ambihue_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.ambihue_off_body),
      });
    }
  }


  async SetActiveIdentifier(value: CharacteristicValue) {
    const input = this.inputs[value as number];
    this.platform.log.debug('Setting input to: ', input.name, input.type, InputType.App);

    if (this.TvState.TvActive === false) {
      this.platform.log.debug('Waiting for TV to turn on');
      await this.waitFor(this.startup_time);
    }

    if (input.type as InputType === InputType.TV) {
      await fetchTimeout(this.input_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: 'WatchTV' }),
      })
        .then(response => response.text())
        .then(data => this.platform.log.debug('response: ', data))
        .then(async () => await this.waitFor(this.input_delay))
        .then(() => {
          this.platform.log.debug('finished WatchTV');
        }).catch(() => {
          this.platform.log.debug('could not finish WatchTV');
        });
    } else {


      let stepsToMake = input.position;
      const moves: string[] = [];

      // Build the moves[]
      if (input.type as InputType === InputType.App) {
        moves.push(JSON.stringify({ key: 'Home' }));
      }
      if (input.type as InputType === InputType.Source) {
        moves.push(JSON.stringify({ key: 'WatchTV' }));

        moves.push(JSON.stringify({ key: 'Source' }));
        moves.push(JSON.stringify({ key: 'CursorDown' }));
      }
      if (input.type as InputType === InputType.Channel) {
        moves.push(JSON.stringify({ key: 'WatchTV' }));
        const num = Math.abs(input.position);
        const digits = num.toString().split('');
        digits.forEach(digit => {
          moves.push(JSON.stringify({ key: 'Digit' + digit }));
        });
      } else {

        while (Math.abs(stepsToMake) !== 0) {
          if (stepsToMake > 0) {
            moves.push(JSON.stringify({ key: 'CursorRight' }));
            stepsToMake--;
          }
          if (stepsToMake < 0) {
            moves.push(JSON.stringify({ key: 'CursorLeft' }));
            stepsToMake++;
          }
        }
      }
      moves.push(JSON.stringify({ key: 'Confirm' }));

      this.platform.log.debug('Moves: ', moves);


      // Execute moves[] one-by-one
      for (const move of moves) {

        await fetchTimeout(this.input_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: move,
        })
          .then(response => response.text())
          .then(data => this.platform.log.debug('response: ', data))
          .then(async () => await this.waitFor(this.input_delay))
          .then(() => {
            this.platform.log.debug('finished move ', move);
          }).catch(() => {
            this.platform.log.debug('could not finish move ', move);
          });

        // Aditional delays because WatchTV takes time to load and even more if there are no channels installed.
        if (move === JSON.stringify({ key: 'WatchTV' })) {
          if (this.has_no_channels === true) {
            this.platform.log.debug('waiting ' + this.channel_setup_popup_time + ' ms for channel popup');
            await this.waitFor(this.channel_setup_popup_time);
          } else {
            await this.waitFor(this.input_delay);
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

    await fetchTimeout(this.input_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(KeyToPress),
    });
  }
}
