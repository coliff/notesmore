import jwtDecode from 'jwt-decode';

export default {
  get token() {
    let token = localStorage.getItem('token')
    if (token) {
      let decodedToken = jwtDecode(token),
        time = new Date().getTime() / 1000;
      if (time < decodedToken.exp) {
        return token
      }
    }
    return null
  },
  set token(value) {
    localStorage.setItem('token', value)
  },

  // get currentDomainId() {
  //   debugger;
  //   let domain = document.domain, currentDomainId, index
  //   index = domain.indexOf('.notesmore.com');
  //   if (index >= 0) {
  //     currentDomainId = domain.slice(0, index);
  //   }

  //   index = domain.indexOf('.notesmore.cn');
  //   if (index >= 0) {
  //     currentDomainId = domain.slice(0, index);
  //   }

  //   if (!currentDomainId || currentDomainId == 'www') {
  //     currentDomainId = localStorage.getItem("currentDomainId") || '.root';
  //   }

  //   return currentDomainId;
  // },

  // set currentDomainId(value) {
  //   localStorage.setItem('currentDomainId', value)
  // },

  get locale() {
    return localStorage.getItem('locale') || navigator.language
  },
  set locale(value) {
    localStorage.setItem('locale', value)
  },

  isSidebarNavCollapse: false,
  currentDomainId: null,
  crumbList: []
}